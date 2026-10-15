import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, readUploadForm, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { parsePeriodDates, periodSchema } from "@/lib/audit-periods";
import { frequencyLabel, parseSheet } from "@/lib/control-sheet";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Loads a filled-in control sheet for a framework and (on import) creates the audit period.
 * mode=preview only validates and reports what would change; mode=import applies it.
 */
export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    const form = await readUploadForm(req, MAX_BYTES, "The sheet must be 5 MB or smaller.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose the filled-in control sheet to upload");
    if (file.size > MAX_BYTES) throw new HttpError(413, "The sheet must be 5 MB or smaller.");
    const mode = form.get("mode") === "import" ? "import" : "preview";

    const period = periodSchema.safeParse({
      name: String(form.get("name") ?? ""),
      frameworkId: String(form.get("frameworkId") ?? ""),
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? ""),
    });
    if (!period.success) throw new HttpError(400, period.error.issues[0]?.message ?? "Fill in the audit period details");
    const { start, end } = parsePeriodDates(period.data.startDate, period.data.endDate);

    const framework = await prisma.framework.findFirst({
      where: { id: period.data.frameworkId, organizationId: user.organizationId },
      select: { id: true, name: true, requirements: { select: { id: true, code: true } } },
    });
    if (!framework) throw new HttpError(404, "Framework not found");

    const sheet = await parseSheet(file);
    if (sheet.missingColumns.length) {
      throw new HttpError(400, `The sheet is missing these columns: ${sheet.missingColumns.join(", ")}. Download the template and keep its header row.`);
    }
    if (sheet.rows.length === 0 && sheet.errors.length === 0) throw new HttpError(400, "The sheet has no controls in it.");

    const [users, existing, inScope] = await Promise.all([
      prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, email: true, name: true } }),
      prisma.control.findMany({
        where: { organizationId: user.organizationId, code: { in: sheet.rows.map((r) => r.code) } },
        select: { id: true, code: true, frequency: true },
      }),
      prisma.control.findMany({
        where: { organizationId: user.organizationId, mappings: { some: { requirement: { frameworkId: framework.id } } } },
        select: { code: true },
      }),
    ]);
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    const existingByCode = new Map(existing.map((c) => [c.code.toLowerCase(), c]));
    const reqByCode = new Map(framework.requirements.map((r) => [r.code.toLowerCase(), r]));

    const unknownOwners = new Set<string>();
    const newCriteria = new Map<string, string>();
    const rows = sheet.rows.map((r) => {
      const current = existingByCode.get(r.code.toLowerCase());
      const owner = r.owner ? userByEmail.get(r.owner) : undefined;
      if (r.owner && !owner) unknownOwners.add(r.owner);
      for (const c of r.criteria) if (!reqByCode.has(c.toLowerCase())) newCriteria.set(c.toLowerCase(), c);
      return {
        row: r.row, code: r.code, title: r.title, criteria: r.criteria,
        action: current ? ("update" as const) : ("create" as const),
        owner: owner?.name ?? (r.owner ? `${r.owner} (not a user)` : null),
        frequency: frequencyLabel(r.frequency!),
      };
    });
    const sheetCodes = new Set(sheet.rows.map((r) => r.code.toLowerCase()));
    const summary = {
      create: rows.filter((p) => p.action === "create").length,
      update: rows.filter((p) => p.action === "update").length,
      errors: sheet.errors,
      unknownOwners: [...unknownOwners],
      newCriteria: [...newCriteria.values()],
      notInSheet: inScope.filter((c) => !sheetCodes.has(c.code.toLowerCase())).map((c) => c.code),
    };

    if (mode === "preview") return NextResponse.json({ ...summary, rows });
    if (sheet.errors.length) throw new HttpError(400, "Fix the rows with problems and upload the sheet again.");

    const created = await prisma.$transaction(async (tx) => {
      // Criteria the framework doesn't have yet are added so the controls can be mapped to them.
      let order = framework.requirements.length;
      for (const code of newCriteria.values()) {
        const r = await tx.frameworkRequirement.create({
          data: { frameworkId: framework.id, code, title: code, sortOrder: order++ },
          select: { id: true, code: true },
        });
        reqByCode.set(code.toLowerCase(), r);
      }

      for (const r of sheet.rows) {
        const ownerId = r.owner ? userByEmail.get(r.owner)?.id : undefined;
        // Blank optional cells keep what the control already has.
        const fields = {
          title: r.title,
          frequency: r.frequency!,
          ...(r.description ? { description: r.description } : {}),
          ...(r.evidence ? { implementationNotes: r.evidence } : {}),
          ...(r.status ? { status: r.status } : {}),
          ...(ownerId ? { ownerId } : {}),
        };
        const current = existingByCode.get(r.code.toLowerCase());
        const control = current
          ? await tx.control.update({ where: { id: current.id }, data: fields, select: { id: true } })
          : await tx.control.create({ data: { organizationId: user.organizationId, code: r.code, ...fields }, select: { id: true } });
        await tx.controlMapping.createMany({
          data: r.criteria.map((c) => ({ controlId: control.id, frameworkRequirementId: reqByCode.get(c.toLowerCase())!.id })),
          skipDuplicates: true,
        });
      }

      const p = await tx.auditPeriod.create({
        data: {
          organizationId: user.organizationId, frameworkId: framework.id, name: period.data.name,
          startDate: start, endDate: end, createdById: user.id,
        },
      });
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: p.id, entityName: p.name, action: "CREATE",
          afterJson: {
            name: p.name, framework: framework.name, startDate: period.data.startDate, endDate: period.data.endDate,
            importedFrom: file.name, controlsCreated: summary.create, controlsUpdated: summary.update,
            criteriaAdded: summary.newCriteria,
          },
        },
        tx
      );
      return p;
    }, { timeout: 120_000, maxWait: 10_000 });

    return NextResponse.json({ periodId: created.id, created: summary.create, updated: summary.update }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
