import { strToU8, zipSync, type Zippable } from "fflate";
import { csvCell } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { HttpError, handleError, requirePermission } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { periodCoverage } from "@/lib/audit-periods";
import { readUpload } from "@/lib/storage";

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Approved", IN_REVIEW: "In review (not yet approved)", READY: "Uploaded, not submitted",
  CHANGES_REQUESTED: "Changes requested", DUE: "Missing (period still open)", OVERDUE: "MISSING", UPCOMING: "Not started",
};

// Safe, readable path segments for every OS the auditor might unzip on.
const segment = (s: string, max = 80) =>
  s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, max).replace(/[. ]+$/, "") || "untitled";


const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

// The audit package: every in-scope control's evidence for each slot of the period, plus an index.
// Missing and unapproved slots are listed in the index so gaps are visible, not silently dropped.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { resolved, ...user } = await requirePermission(PERMISSIONS.REPORTS_EXPORT);
    const { id } = await params;
    const cov = await periodCoverage(user.organizationId, id);
    if (!cov) throw new HttpError(404, "Audit period not found");

    const files: Zippable = {};
    const header = [
      "Control", "Control title", "Requirements", "Frequency", "Owner", "Period", "Period start", "Period end",
      "Status", "File", "Path in package", "Uploaded by", "Uploaded at", "Reviewed by", "Reviewed at", "Submitted by", "Reviewer note",
    ];
    const rows: string[] = [header.map(csvCell).join(",")];
    const evidenceIds = cov.controls.flatMap((c) => c.slots.flatMap((s) => s.evidence.map((e) => e.id)));
    const stored = await prisma.evidence.findMany({
      where: { id: { in: evidenceIds }, organizationId: user.organizationId },
      select: { id: true, fileUrl: true, policy: { select: { title: true, version: true, status: true } } },
    });
    const storedById = new Map(stored.map((e) => [e.id, e]));

    let fileCount = 0;
    for (const c of cov.controls) {
      const controlDir = segment(`${c.code} - ${c.title}`);
      for (const slot of c.slots) {
        const base = [
          c.code, c.title, c.requirements.join("; "), c.frequency, c.owner?.name ?? "Unassigned",
          slot.label, day(slot.start), day(slot.end), STATUS_LABEL[slot.status] ?? slot.status,
        ];
        const reviewCols = (e?: { reviewedBy: string | null; reviewedAt: string | null }) => [
          e?.reviewedBy ?? slot.reviewedBy ?? "", day(e?.reviewedAt ?? slot.reviewedAt), slot.submittedBy ?? "", slot.note,
        ];
        if (slot.evidence.length === 0) {
          rows.push([...base, "", "", "", "", ...reviewCols()].map(csvCell).join(","));
          continue;
        }
        const used = new Set<string>();
        for (const e of slot.evidence) {
          const record = storedById.get(e.id);
          let name = segment(e.fileName, 120);
          for (let n = 2; used.has(name.toLowerCase()); n++) name = segment(`${n} - ${e.fileName}`, 120);
          used.add(name.toLowerCase());
          const path = `${controlDir}/${segment(slot.label)}/${name}`;
          let packaged = path;
          try {
            if (record?.fileUrl.startsWith("local:")) {
              files[path] = new Uint8Array(await readUpload(record.fileUrl.slice("local:".length)));
              fileCount++;
            } else if (record?.policy) {
              files[`${path}.txt`] = strToU8(
                `Policy linked as evidence: ${record.policy.title}\nVersion: ${record.policy.version}\nStatus: ${record.policy.status}\n`
              );
              packaged = `${path}.txt`;
            } else {
              packaged = "(file not stored locally)";
            }
          } catch {
            packaged = "(file missing from storage)";
          }
          rows.push([...base, e.fileName, packaged, e.uploadedBy ?? "", day(e.createdAt), ...reviewCols(e)].map(csvCell).join(","));
        }
      }
    }

    const c = cov.counts;
    const generated = new Date().toISOString().replace("T", " ").slice(0, 16);
    files["evidence-index.csv"] = strToU8("﻿" + rows.join("\r\n") + "\r\n");
    files["README.txt"] = strToU8(
      [
        `${cov.period.name}`,
        `Framework: ${cov.period.framework.name}`,
        `Audit period: ${day(cov.period.startDate)} to ${day(cov.period.endDate)}`,
        `Generated: ${generated} UTC by ${user.name}`,
        "",
        `Controls in scope: ${cov.controls.length}`,
        `Evidence periods: ${c.total} — approved ${c.approved}, in review ${c.inReview}, uploaded but not submitted ${c.ready},`,
        `  changes requested ${c.changesRequested}, missing ${c.overdue + c.due}, not started ${c.upcoming}`,
        `Files included: ${fileCount}`,
        "",
        "evidence-index.csv lists every control and period, including periods with no evidence (marked MISSING).",
        "Files are organised as <control>/<period>/<file>.",
        "",
      ].join("\r\n")
    );

    const zip = zipSync(files, { level: 6 });
    await logAudit({
      organizationId: user.organizationId, userId: user.id, userName: user.name,
      entityType: "AuditPeriod", entityId: id, entityName: cov.period.name, action: "EXPORT",
      metadataJson: { files: fileCount, slots: c.total, approved: c.approved, missing: c.overdue + c.due },
    });

    const fileName = `${segment(cov.period.name)} - evidence package.zip`;
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(zip.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
