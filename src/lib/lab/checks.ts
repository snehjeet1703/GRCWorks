import { prisma } from "@/lib/db";
import { slotsFor } from "@/lib/audit-periods";
import { getCourse, getTemplate, type LabCheck } from "./content";

// Check types are defined in grcworks-labs/schema/checks.md. They only read the learner's own organisation.
const s = (v: unknown) => String(v ?? "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

async function control(orgId: string, code: unknown) {
  return prisma.control.findUnique({ where: { organizationId_code: { organizationId: orgId, code: s(code) } } });
}

async function risk(orgId: string, title: unknown) {
  return prisma.risk.findFirst({ where: { organizationId: orgId, title: s(title) }, include: { controls: { include: { control: true } } } });
}

async function vendorByKey(orgId: string, key: unknown) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { labCourseId: true } });
  const course = org.labCourseId ? await getCourse(org.labCourseId) : null;
  const t = course ? await getTemplate(course.template) : null;
  const name = t?.vendors.find((v) => v.key === s(key))?.name;
  return name ? prisma.vendor.findFirst({ where: { organizationId: orgId, name } }) : null;
}

async function runCheck(orgId: string, c: LabCheck): Promise<boolean> {
  switch (c.type) {
    case "control_status":
      return list(c.in).includes((await control(orgId, c.control))?.status ?? "");
    case "control_owner_set":
      return !!(await control(orgId, c.control))?.ownerId;
    case "control_frequency":
      return (await control(orgId, c.control))?.frequency === s(c.equals);
    case "mapping_exists": {
      const ctl = await control(orgId, c.control);
      if (!ctl) return false;
      return (await prisma.controlMapping.count({
        where: { controlId: ctl.id, requirement: { code: s(c.requirement), framework: { organizationId: orgId, name: s(c.framework) } } },
      })) > 0;
    }
    case "evidence_linked": {
      const ctl = await control(orgId, c.control);
      if (!ctl) return false;
      const n = await prisma.evidenceControl.count({
        where: { controlId: ctl.id, evidence: { organizationId: orgId, ...(c.status ? { status: s(c.status) as "VALID" } : {}) } },
      });
      return n >= Number(c.min ?? 1);
    }
    case "slot_review": {
      const ctl = await control(orgId, c.control);
      if (!ctl) return false;
      const q = Number(s(c.slot).replace(/^Q/, "")) - 1;
      const reviews = await prisma.evidenceSlotReview.findMany({
        where: { controlId: ctl.id, auditPeriod: { organizationId: orgId } },
        include: { auditPeriod: true },
      });
      // Match by quarter label so the check holds whatever the control's frequency became.
      return reviews.some((r) => {
        const slot = slotsFor("QUARTERLY", r.auditPeriod.startDate, r.auditPeriod.endDate)[q];
        const own = slotsFor(ctl.frequency, r.auditPeriod.startDate, r.auditPeriod.endDate)[r.slotIndex];
        return !!slot && !!own && own.start >= slot.start && own.start <= slot.end && list(c.in).includes(r.status);
      });
    }
    case "risk_linked": {
      const r = await risk(orgId, c.riskTitle);
      return !!r?.controls.some((rc) => rc.control.code === s(c.control));
    }
    case "risk_treatment_set": {
      const r = await risk(orgId, c.riskTitle);
      return !!r && r.treatmentPlan.trim().length > 0 && (!c.treatment || r.treatment === s(c.treatment));
    }
    case "vendor_assessed": {
      const v = await vendorByKey(orgId, c.vendor);
      if (!v) return false;
      const res = await prisma.questionnaireResponse.findMany({ where: { vendorId: v.id, status: "REVIEWED" } });
      return res.some((r) => c.maxScore == null || (r.score != null && r.score <= Number(c.maxScore)));
    }
    case "vendor_risk_recorded": {
      const v = await vendorByKey(orgId, c.vendor);
      if (!v) return false;
      const r = await prisma.risk.findFirst({
        where: { organizationId: orgId, title: { contains: v.name, mode: "insensitive" }, treatmentPlan: { not: "" } },
      });
      return !!r;
    }
    case "policy_approved":
      return (await prisma.policy.count({
        where: { organizationId: orgId, status: "APPROVED", title: { contains: s(c.titleIncludes), mode: "insensitive" } },
      })) > 0;
    case "evidence_package_exported": {
      const periods = await prisma.auditPeriod.findMany({
        where: { organizationId: orgId, framework: { name: s(c.framework) } }, select: { id: true },
      });
      return (await prisma.auditLog.count({
        where: { organizationId: orgId, entityType: "AuditPeriod", action: "EXPORT", entityId: { in: periods.map((p) => p.id) } },
      })) > 0;
    }
    case "trust_center_published": {
      const cfg = await prisma.trustVaultConfig.findUnique({
        where: { organizationId: orgId },
        include: { ndas: { where: { active: true } }, documents: { where: { enabled: true } } },
      });
      if (!cfg?.enabled) return false;
      if (c.withNda && (!cfg.requireNda || cfg.ndas.length === 0)) return false;
      return cfg.documents.length >= Number(c.minDocuments ?? 0);
    }
    case "trust_request_decided":
      return (await prisma.trustAccessRequest.count({
        where: {
          config: { organizationId: orgId },
          status: c.decision ? (s(c.decision) as "APPROVED") : { in: ["APPROVED", "DENIED"] },
        },
      })) > 0;
    default:
      return false;
  }
}

export type TaskResult = { id: string; done: boolean; completedAt: Date | null };
export type LabResult = { id: string; tasks: TaskResult[] };

/** Runs every task's checks for the organisation's course and records first completions. */
export async function evaluateCourse(orgId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { labCourseId: true } });
  const course = org.labCourseId ? await getCourse(org.labCourseId) : null;
  if (!course) return null;

  const recorded = new Map(
    (await prisma.labTaskCompletion.findMany({ where: { organizationId: orgId, courseId: course.id } }))
      .map((r) => [`${r.labId}/${r.taskId}`, r.completedAt])
  );
  const labs: LabResult[] = [];
  for (const lab of course.labs) {
    const tasks: TaskResult[] = [];
    for (const task of lab.tasks) {
      const key = `${lab.id}/${task.id}`;
      let done = true;
      for (const check of task.checks) if (!(await runCheck(orgId, check))) { done = false; break; }
      let completedAt = recorded.get(key) ?? null;
      if (done && !completedAt) {
        completedAt = (await prisma.labTaskCompletion.upsert({
          where: { organizationId_courseId_labId_taskId: { organizationId: orgId, courseId: course.id, labId: lab.id, taskId: task.id } },
          create: { organizationId: orgId, courseId: course.id, labId: lab.id, taskId: task.id },
          update: {},
        })).completedAt;
      }
      // A task stays ticked once completed, even if the learner later undoes the change.
      tasks.push({ id: task.id, done: done || !!completedAt, completedAt });
    }
    labs.push({ id: lab.id, tasks });
  }
  return { course, labs };
}
