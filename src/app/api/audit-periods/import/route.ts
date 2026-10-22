import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, handleError, readUploadForm, requirePermission, userHasPermission } from "@/lib/api";
import { limitOrNull } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { addToScope, parsePeriodDates, periodSchema } from "@/lib/audit-periods";
import { frequencyLabel, parseSheet } from "@/lib/control-sheet";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Loads a filled-in control sheet for a framework and (on import) creates the audit period.
 * mode=preview only validates and reports what would change; mode=import applies it.
 */
export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.FRAMEWORKS_MANAGE);
    // The import creates and edits controls too, so it needs both permissions.
    if (!(await userHasPermission(user.id, PERMISSIONS.CONTROLS_WRITE))) {
      throw new HttpError(403, `Importing a control sheet needs the "Edit controls" permission as well as "Manage frameworks".`);
    }
    const limited = limitOrNull(`control-import:${user.id}`, 30, 10 * 60 * 1000);
    if (limited) return limited;
    const form = await readUploadForm(req, MAX_BYTES, "The sheet must be 5 MB or smaller.");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose the filled-in control sheet to upload");
    if (file.size > MAX_BYTES) throw new HttpError(413, "The sheet must be 5 MB or smaller.");
    const mode = form.get("mode") === "import" ? "import" : "preview";
    // Full scope: the sheet is the complete control list. Framework controls missing from it are unlinked
    // from the framework (not deleted) and left out of the period.
    const fullScope = form.get("fullScope") === "true";

    // Without an audit period the sheet only loads controls and requirements into the framework
    // (e.g. a custom framework or privacy law added from the Compliance page).
    const createPeriod = form.get("createPeriod") !== "false";
    const frameworkId = String(form.get("frameworkId") ?? "");
    let periodInput: { name: string; startDate: string; endDate: string; start: Date; end: Date } | null = null;
    if (createPeriod) {
      const period = periodSchema.safeParse({
        name: String(form.get("name") ?? ""),
        frameworkId,
        startDate: String(form.get("startDate") ?? ""),
        endDate: String(form.get("endDate") ?? ""),
      });
      if (!period.success) throw new HttpError(400, period.error.issues[0]?.message ?? "Fill in the audit period details");
      periodInput = { ...period.data, ...parsePeriodDates(period.data.startDate, period.data.endDate) };
    } else if (!/^[0-9a-f-]{36}$/i.test(frameworkId)) {
      throw new HttpError(400, "Choose a framework");
    }

    const framework = await prisma.framework.findFirst({
      where: { id: frameworkId, organizationId: user.organizationId },
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
        select: { id: true, code: true },
      }),
    ]);
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    const existingByCode = new Map(existing.map((c) => [c.code.toLowerCase(), c]));
    const reqByCode = new Map(framework.requirements.map((r) => [r.code.toLowerCase(), r]));
    const MAX_NEW_CRITERIA = 300;

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
      fullScope,
    };
    const notInSheetIds = inScope.filter((c) => !sheetCodes.has(c.code.toLowerCase())).map((c) => c.id);

    if (newCriteria.size > MAX_NEW_CRITERIA) {
      throw new HttpError(400, `The sheet introduces ${newCriteria.size} criteria that ${framework.name} doesn't have (limit ${MAX_NEW_CRITERIA}). Check the criteria column matches the framework's IDs.`);
    }
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

      const sheetControlIds: string[] = [];
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
        sheetControlIds.push(control.id);
        await tx.controlMapping.createMany({
          data: r.criteria.map((c) => ({ controlId: control.id, frameworkRequirementId: reqByCode.get(c.toLowerCase())!.id })),
          skipDuplicates: true,
        });
      }

      let unlinked = 0;
      if (fullScope && notInSheetIds.length) {
        unlinked = (await tx.controlMapping.deleteMany({
          where: { controlId: { in: notInSheetIds }, requirement: { frameworkId: framework.id } },
        })).count;
      }

      const importDetails = {
        framework: framework.name, importedFrom: file.name, controlsCreated: summary.create, controlsUpdated: summary.update,
        criteriaAdded: summary.newCriteria, fullScope, unlinkedFromFramework: fullScope ? summary.notInSheet : [], mappingsRemoved: unlinked,
      };
      if (!periodInput) {
        await logAudit(
          {
            organizationId: user.organizationId, userId: user.id, userName: user.name,
            entityType: "Framework", entityId: framework.id, entityName: framework.name, action: "UPDATE",
            changes: { sheetImport: importDetails },
          },
          tx
        );
        return null;
      }

      const p = await tx.auditPeriod.create({
        data: {
          organizationId: user.organizationId, frameworkId: framework.id, name: periodInput.name,
          startDate: periodInput.start, endDate: periodInput.end, createdById: user.id,
        },
      });
      // Frequencies come from the sheet (already saved on the controls above).
      const scoped = await addToScope(tx, user.organizationId, p.id, framework.id, fullScope ? sheetControlIds : undefined);
      await logAudit(
        {
          organizationId: user.organizationId, userId: user.id, userName: user.name,
          entityType: "AuditPeriod", entityId: p.id, entityName: p.name, action: "CREATE",
          afterJson: {
            name: p.name, startDate: periodInput.startDate, endDate: periodInput.endDate, controlsInScope: scoped, ...importDetails,
          },
        },
        tx
      );
      return p;
    }, { timeout: 120_000, maxWait: 10_000 });

    return NextResponse.json({ periodId: created?.id ?? null, frameworkId: framework.id, created: summary.create, updated: summary.update }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
