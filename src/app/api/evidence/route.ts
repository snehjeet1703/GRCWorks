import { NextResponse } from "next/server";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { saveUpload } from "@/lib/storage";

const controlIdsSchema = z.array(z.string().uuid()).min(1, "Select at least one control").max(200);

const policyEvidenceSchema = z.object({
  // `controlId` is the legacy single-control form; `controlIds` links one artifact to several controls.
  controlId: z.string().uuid().optional(),
  controlIds: controlIdsSchema.optional(),
  policyId: z.string().min(1),
  notes: z.string().max(2000).default(""),
}).strict();

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// Whitelist by extension AND content-type. Both must match a row.
const ALLOWED: { ext: string; mime: string[] }[] = [
  { ext: ".pdf", mime: ["application/pdf"] },
  { ext: ".png", mime: ["image/png"] },
  { ext: ".jpg", mime: ["image/jpeg"] },
  { ext: ".jpeg", mime: ["image/jpeg"] },
  { ext: ".gif", mime: ["image/gif"] },
  { ext: ".webp", mime: ["image/webp"] },
  { ext: ".svg", mime: ["image/svg+xml"] },
  { ext: ".txt", mime: ["text/plain"] },
  { ext: ".md", mime: ["text/plain", "text/markdown"] },
  { ext: ".csv", mime: ["text/csv", "application/vnd.ms-excel", "text/plain"] },
  { ext: ".json", mime: ["application/json", "text/plain"] },
  { ext: ".docx", mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  { ext: ".xlsx", mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
  { ext: ".zip", mime: ["application/zip", "application/x-zip-compressed"] },
];

const EXPIRY_WARNING_DAYS = 30;

// Loads the controls by id, all of which must belong to the organisation.
async function loadControls(organizationId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const parsed = controlIdsSchema.safeParse(unique);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid controls");
  const controls = await prisma.control.findMany({
    where: { id: { in: unique }, organizationId },
    select: { id: true, code: true },
  });
  if (controls.length !== unique.length) throw new HttpError(404, "Control not found");
  return controls;
}

export function computeEvidenceStatus(
  e: { status: string; validFrom: Date | null; validUntil: Date | null },
  now: Date = new Date()
): string {
  if (e.status === "REJECTED") return "REJECTED";
  if (e.validUntil) {
    const until = new Date(e.validUntil);
    if (until < now) return "EXPIRED";
    const diffMs = until.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays <= EXPIRY_WARNING_DAYS) return "EXPIRING";
  }
  if (e.validFrom) {
    const from = new Date(e.validFrom);
    if (from > now) return "PENDING";
  }
  return "VALID";
}

const MAGIC_BYTES: Record<string, number[]> = {
  ".pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  ".png": [0x89, 0x50, 0x4e, 0x47], // .PNG
  ".jpg": [0xff, 0xd8, 0xff],
  ".jpeg": [0xff, 0xd8, 0xff],
  ".gif": [0x47, 0x49, 0x46],       // GIF
  ".zip": [0x50, 0x4b, 0x03, 0x04],
  ".docx": [0x50, 0x4b, 0x03, 0x04],
  ".xlsx": [0x50, 0x4b, 0x03, 0x04],
};

function assertMagicBytes(fileName: string, data: Uint8Array) {
  const ext = path.extname(fileName).toLowerCase();
  const expected = MAGIC_BYTES[ext];
  if (!expected) return;
  if (data.length < expected.length) {
    throw new HttpError(400, `File content does not match expected format for "${ext}"`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (data[i] !== expected[i]) {
      throw new HttpError(400, `File content does not match expected format for "${ext}"`);
    }
  }
}

function assertAllowed(fileName: string, mime: string) {
  const ext = path.extname(fileName).toLowerCase();
  const row = ALLOWED.find((a) => a.ext === ext);
  if (!row) {
    throw new HttpError(400, `File type "${ext || "(none)"}" is not allowed`);
  }
  // Some browsers send "application/octet-stream" for known extensions — allow if extension matches.
  const mimeOk = row.mime.includes(mime) || mime === "application/octet-stream" || mime === "";
  if (!mimeOk) {
    throw new HttpError(
      400,
      `File content type "${mime}" does not match extension "${ext}"`
    );
  }
}

export async function GET(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_READ);
    const url = new URL(req.url);
    const controlId = url.searchParams.get("controlId");
    const evidence = await prisma.evidence.findMany({
      where: {
        organizationId: user.organizationId,
        ...(controlId ? { controls: { some: { controlId } } } : {}),
      },
      include: {
        controls: { select: { control: { select: { id: true, code: true, title: true } } } },
        uploadedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    const enriched = evidence.map((e) => ({
      ...e,
      computedStatus: computeEvidenceStatus(e, now),
    }));
    return NextResponse.json(enriched);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.EVIDENCE_UPLOAD);
    const contentType = req.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (isJson) {
      const { controlId, controlIds, policyId, notes } = await parseBody(req, policyEvidenceSchema);

      const [controls, policy] = await Promise.all([
        loadControls(user.organizationId, controlIds ?? (controlId ? [controlId] : [])),
        prisma.policy.findFirst({
          where: { id: policyId, organizationId: user.organizationId },
        }),
      ]);
      if (!policy) throw new HttpError(404, "Policy not found");

      const evidence = await prisma.$transaction(async (tx) => {
        const row = await tx.evidence.create({
          data: {
            organizationId: user.organizationId,
            controls: { create: controls.map((c) => ({ controlId: c.id })) },
            uploadedById: user.id,
            type: "POLICY",
            policyId,
            fileName: policy.title,
            fileUrl: "",
            fileSize: 0,
            notes,
          },
        });
        await logAudit(
          {
            organizationId: user.organizationId,
            userId: user.id,
            userName: user.name,
            entityType: "Evidence",
            entityId: row.id,
            entityName: `Policy: ${policy.title}`,
            action: "CREATE",
            changes: { policyTitle: policy.title, controlCodes: controls.map((c) => c.code) },
          },
          tx
        );
        return row;
      });

      return NextResponse.json(evidence, { status: 201 });
    }

    const form = await req.formData();
    // Accept repeated `controlIds` fields, or the legacy single `controlId`.
    const controlIds = [...form.getAll("controlIds"), ...form.getAll("controlId")].filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );
    const notes = (form.get("notes") as string | null) ?? "";
    const description = (form.get("description") as string | null) ?? "";
    const evidenceType = (form.get("type") as string | null) ?? "UPLOAD";
    const source = (form.get("source") as string | null) ?? "MANUAL_UPLOAD";
    const collectedAt = form.get("collectedAt") as string | null;
    const validFrom = form.get("validFrom") as string | null;
    const validUntil = form.get("validUntil") as string | null;
    const file = form.get("file");
    if (controlIds.length === 0) {
      throw new HttpError(400, "Select at least one control");
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new HttpError(400, "file is required");
    }
    if (file.size > MAX_BYTES) {
      throw new HttpError(400, `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit`);
    }
    assertAllowed(file.name, file.type);

    const controls = await loadControls(user.organizationId, controlIds);

    const arr = await file.arrayBuffer();
    assertMagicBytes(file.name, new Uint8Array(arr));
    const stored = await saveUpload(file.name, arr);

    const evidence = await prisma.$transaction(async (tx) => {
      const row = await tx.evidence.create({
        data: {
          organizationId: user.organizationId,
          controls: { create: controls.map((c) => ({ controlId: c.id })) },
          uploadedById: user.id,
          type: evidenceType as any,
          source: source as any,
          fileName: file.name,
          fileUrl: `local:${stored.storageKey}`,
          fileSize: stored.size,
          description,
          notes,
          collectedAt: collectedAt ? new Date(collectedAt) : new Date(),
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
        },
      });
      await logAudit(
        {
          organizationId: user.organizationId,
          userId: user.id,
          userName: user.name,
          entityType: "Evidence",
          entityId: row.id,
          entityName: file.name,
          action: "CREATE",
          changes: { fileName: file.name, controlCodes: controls.map((c) => c.code) },
        },
        tx
      );
      return row;
    });

    return NextResponse.json(evidence, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
