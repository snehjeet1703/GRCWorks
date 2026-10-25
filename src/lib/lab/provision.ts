import { randomBytes } from "node:crypto";
import type {
  ControlFrequency, ControlStatus, EvidenceStatus, PolicyStatus, Prisma, RiskTreatment, SlotReviewStatus, UserRole,
  VendorCategory, VendorCriticality, VendorStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureBuiltInRoles } from "@/lib/built-in-roles";
import { installCatalogFramework, isCatalogFramework } from "@/lib/framework-catalog";
import { slugify } from "@/lib/install-slug";
import { addToScope, slotsFor } from "@/lib/audit-periods";
import { deleteUpload, saveUpload } from "@/lib/storage";
import type { PortalAnswer, PortalQuestion } from "@/lib/vendor-portal";
import { getCourse, getTemplate, labContent, templateIdOf, type LabTemplate } from "./content";

type Tx = Prisma.TransactionClient;
export type Learner = { email: string; name: string; passwordHash: string };

const ROLE: Record<LabTemplate["team"][number]["role"], { role: UserRole; roleName: string }> = {
  Admin: { role: "ADMIN", roleName: "Admin" },
  Editor: { role: "EDITOR", roleName: "Editor" },
  Viewer: { role: "VIEWER", roleName: "Viewer" },
  Auditor: { role: "VIEWER", roleName: "Viewer" },
};

const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

// A one-page PDF saying what the file stands in for, so downloads open instead of erroring.
function placeholderPdf(title: string, company: string) {
  const text = `${company} - practice evidence: ${title}`.replace(/[()\\]/g, "");
  const stream = `BT /F1 14 Tf 60 740 Td (${text}) Tj 0 -24 Td /F1 11 Tf (Fictional file created for a GRCWorks lab.) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Creates a learner's practice company from one of the course's templates (the first if none is given). */
export async function provisionPracticeOrg(courseId: string, templateId: string | null, learner: Learner) {
  const course = await getCourse(courseId);
  if (!course) throw new Error(`Unknown course ${courseId}`);
  const id = templateId && course.templates.includes(templateId) ? templateId : course.templates[0];
  const t = await getTemplate(id);
  if (!t) throw new Error(`Unknown template ${id}`);

  // Files are written before the transaction (storage isn't transactional) and removed if it fails.
  const files = new Map<string, { key: string; size: number; name: string }>();
  for (const e of t.evidence) {
    const name = e.file.replace(/\.[a-z0-9]+$/i, ".pdf");
    const saved = await saveUpload(name, placeholderPdf(e.file, t.company.name));
    files.set(e.file, { key: saved.storageKey, size: saved.size, name });
  }

  try {
    return await prisma.$transaction((tx) => applyTemplate(tx, t, course.id, learner, files), { timeout: 60_000 });
  } catch (err) {
    await Promise.all([...files.values()].map((f) => deleteUpload(f.key).catch(() => {})));
    throw err;
  }
}

async function applyTemplate(
  tx: Tx, t: LabTemplate, courseId: string, learner: Learner, files: Map<string, { key: string; size: number; name: string }>
) {
  const suffix = randomBytes(4).toString("hex");
  const org = await tx.organization.create({
    data: {
      name: t.company.name,
      slug: `${slugify(t.company.name)}-${suffix}`,
      practice: true,
      labCourseId: courseId,
      labTemplate: `${t.id}@${t.version}`,
      onboardingComplete: true,
      // One real person per practice company: approvals by "someone else" would block every lab.
      controlApprovalRequired: false,
      remindersEnabled: false,
    },
  });
  const roles = await ensureBuiltInRoles(tx, org.id);

  const me = await tx.user.create({
    data: {
      email: learner.email, name: learner.name, passwordHash: learner.passwordHash,
      role: "ADMIN", roleId: roles.get("Admin") ?? null, organizationId: org.id,
    },
  });
  const people = new Map<string, string>([["me", me.id]]);
  for (const m of t.team) {
    const r = ROLE[m.role];
    const u = await tx.user.create({
      data: {
        // .invalid never resolves, so nothing can be sent to these colleagues.
        email: `${m.key}.${suffix}@practice.grcworks.invalid`,
        name: m.name, passwordHash: null, canSignIn: false,
        role: r.role, roleId: roles.get(r.roleName) ?? null, organizationId: org.id,
      },
    });
    people.set(m.key, u.id);
  }
  const who = (key: string | null | undefined) => (key ? people.get(key) ?? null : null);

  const frameworks = new Map<string, string>();
  for (const name of t.frameworks) {
    if (!isCatalogFramework(name)) throw new Error(`Template framework not in the catalogue: ${name}`);
    await installCatalogFramework(tx, org.id, name);
    frameworks.set(name, (await tx.framework.findFirstOrThrow({ where: { organizationId: org.id, name } })).id);
  }
  const requirementId = async (framework: string, code: string) =>
    (await tx.frameworkRequirement.findFirstOrThrow({ where: { frameworkId: frameworks.get(framework), code } })).id;

  const controls = new Map(
    (await tx.control.findMany({ where: { organizationId: org.id }, select: { id: true, code: true } })).map((c) => [c.code, c.id])
  );
  for (const c of t.controls) {
    const id = controls.get(c.code);
    if (!id) throw new Error(`Template control not installed: ${c.code}`);
    await tx.control.update({
      where: { id },
      data: {
        status: c.status as ControlStatus, ownerId: who(c.owner),
        frequency: c.frequency as ControlFrequency, implementationNotes: c.notes ?? "",
      },
    });
  }
  for (const c of t.customControls) {
    const ctl = await tx.control.create({
      data: {
        organizationId: org.id, code: c.code, title: c.title, status: c.status as ControlStatus,
        ownerId: who(c.owner), frequency: c.frequency as ControlFrequency,
      },
    });
    controls.set(c.code, ctl.id);
    for (const m of c.mapsTo) {
      await tx.controlMapping.create({ data: { controlId: ctl.id, frameworkRequirementId: await requirementId(m.framework, m.requirement) } });
    }
  }
  for (const u of t.unmappedOnPurpose) {
    await tx.controlMapping.deleteMany({
      where: { controlId: controls.get(u.code), frameworkRequirementId: await requirementId(u.framework, u.requirement) },
    });
  }
  const ctl = (code: string) => {
    const id = controls.get(code);
    if (!id) throw new Error(`Unknown control in template: ${code}`);
    return id;
  };

  for (const p of t.policies) {
    const approved = p.status === "APPROVED";
    await tx.policy.create({
      data: {
        organizationId: org.id, title: p.title, status: p.status as PolicyStatus, ownerId: who("cto"),
        content: `${p.title} for ${t.company.name}. This is a practice policy for a GRCWorks lab.`,
        ...(approved ? { approverId: who("cto"), approvedAt: new Date() } : {}),
        controls: { create: p.controls.map((code) => ({ controlId: ctl(code) })) },
      },
    });
  }

  // The audit period starts on the first of a month, startsMonthsAgo months back.
  const ap = t.auditPeriod;
  const now = new Date();
  const start = addMonths(now, -ap.startsMonthsAgo);
  const end = new Date(addMonths(start, ap.lengthMonths).getTime() - 1);
  const period = await tx.auditPeriod.create({
    data: { organizationId: org.id, frameworkId: frameworks.get(ap.framework)!, name: ap.name, startDate: start, endDate: end, createdById: me.id },
  });
  await addToScope(tx, org.id, period.id, period.frameworkId);
  const quarters = slotsFor("QUARTERLY", start, end);

  for (const e of t.evidence) {
    const q = Number(e.periodStart.replace(/^Q/, "")) - 1;
    const slot = quarters[q];
    const f = files.get(e.file)!;
    await tx.evidence.create({
      data: {
        organizationId: org.id, uploadedById: who(e.by), fileName: f.name, fileUrl: `local:${f.key}`, storageKey: f.key,
        fileSize: f.size, status: e.status as EvidenceStatus, periodStart: slot.start, periodEnd: slot.end,
        collectedAt: slot.start < now ? slot.start : now,
        controls: { create: e.controls.map((code) => ({ controlId: ctl(code) })) },
      },
    });
    if (e.slotReview) {
      for (const code of e.controls) {
        await tx.evidenceSlotReview.create({
          data: {
            auditPeriodId: period.id, controlId: ctl(code), slotIndex: q, status: e.slotReview as SlotReviewStatus,
            submittedById: who(e.by), submittedAt: now,
          },
        });
      }
    }
  }

  for (const r of t.risks) {
    const score = r.likelihood * r.impact;
    await tx.risk.create({
      data: {
        organizationId: org.id, title: r.title, category: r.category, likelihood: r.likelihood, impact: r.impact,
        inherentScore: score, residualScore: score, treatment: r.treatment as RiskTreatment, ownerId: who("cto"),
        controls: { create: r.controls.map((code) => ({ controlId: ctl(code) })) },
      },
    });
  }

  const vendors = new Map<string, string>();
  for (const v of t.vendors) {
    const row = await tx.vendor.create({
      data: {
        organizationId: org.id, name: v.name, category: v.category as VendorCategory, criticality: v.criticality as VendorCriticality,
        status: v.status as VendorStatus, dataAccess: v.dataAccess, dataTypes: v.dataTypes,
      },
    });
    vendors.set(v.key, row.id);
  }
  const questionnaires = new Map<string, string>();
  for (const r of t.questionnaireResponses) {
    // The questionnaire is built from the answered questions, typed by their answers.
    const questions: PortalQuestion[] = Object.entries(r.answers).map(([text, value], i) => ({
      id: `q${i + 1}`, text, required: true,
      ...(Array.isArray(value)
        ? { type: "MULTI_CHOICE" as const, options: ["SOC 2 Type II", "ISO 27001", "PCI DSS", "None"] }
        : value === "Yes" || value === "No"
          ? { type: "YES_NO" as const, options: [] }
          : { type: "TEXT" as const, options: [] }),
    }));
    let qid = questionnaires.get(r.questionnaire);
    if (!qid) {
      qid = (await tx.vendorQuestionnaire.create({
        data: { organizationId: org.id, title: r.questionnaire, status: "PUBLISHED", category: "SECURITY", questions },
      })).id;
      questionnaires.set(r.questionnaire, qid);
    }
    const answers: PortalAnswer[] = questions.map((q) => ({ questionId: q.id, value: r.answers[q.text] }));
    await tx.questionnaireResponse.create({
      data: {
        questionnaireId: qid, vendorId: vendors.get(r.vendor)!, status: r.status as "SUBMITTED", answers,
        submittedAt: r.status === "NOT_STARTED" ? null : now,
      },
    });
  }

  // A Trust Center that's set up but off, and one prospect waiting for access (lab 6).
  const config = await tx.trustVaultConfig.create({
    data: {
      organizationId: org.id, enabled: false, heroTitle: `${t.company.name} Trust Center`,
      heroDescription: "How we protect our merchants' and customers' data.",
    },
  });
  await tx.trustAccessRequest.create({
    data: {
      configId: config.id, email: `security.${suffix}@prospect.grcworks.invalid`, name: "Priya Nair",
      company: "Northwind Retail (fictional)", reason: "Vendor security review before signing with Kestrel Pay.",
    },
  });

  return { userId: me.id, organizationId: org.id };
}

/**
 * Replaces a learner's practice company with a fresh copy: the new company is built first, then the learner's
 * account moves to it and the old company (with its fictional colleagues and data) is deleted.
 */
export async function resetPracticeOrg(userId: string, templateId?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, passwordHash: true,
      organization: { select: { id: true, practice: true, labCourseId: true, labTemplate: true } },
    },
  });
  const old = user.organization;
  if (!old.practice || !old.labCourseId || !user.passwordHash) throw new Error("Not a practice company");

  // Emails are unique, so the learner takes a placeholder address in the new company until the old one is gone.
  const parked = `reset.${randomBytes(6).toString("hex")}@practice.grcworks.invalid`;
  // A new industry may belong to another course (e.g. moving from SOC 2 from Scratch to GRC Daily Operations).
  const courseId = templateId
    ? (await labContent()).courses.find((c) => c.templates.includes(templateId))?.id ?? old.labCourseId
    : old.labCourseId;
  const fresh = await provisionPracticeOrg(courseId, templateId ?? templateIdOf(old.labTemplate), { email: parked, name: user.name, passwordHash: user.passwordHash });

  const oldKeys = await prisma.evidence.findMany({ where: { organizationId: old.id }, select: { storageKey: true } });
  await prisma.$transaction(async (tx) => {
    // Move the real account (keeping its id, MFA and sign-in history) and drop the placeholder.
    const placeholder = await tx.user.findUniqueOrThrow({ where: { email: parked }, select: { id: true, roleId: true } });
    await tx.control.updateMany({ where: { ownerId: placeholder.id }, data: { ownerId: user.id } });
    await tx.auditPeriod.updateMany({ where: { createdById: placeholder.id }, data: { createdById: user.id } });
    await tx.user.delete({ where: { id: placeholder.id } });
    await tx.userFrameworkScope.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { organizationId: fresh.organizationId, roleId: placeholder.roleId, role: "ADMIN" } });
    await tx.organization.delete({ where: { id: old.id } });
  });
  await Promise.all(oldKeys.filter((e) => e.storageKey).map((e) => deleteUpload(e.storageKey).catch(() => {})));
  return fresh.organizationId;
}
