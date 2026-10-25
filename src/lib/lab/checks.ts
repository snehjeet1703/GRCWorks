import { prisma } from "@/lib/db";
import { slotsFor } from "@/lib/audit-periods";
import { buildExercise } from "./exercises";
import { levelOf } from "./levels";
import { freeLabsFor, getAccess, labUnlocked } from "./access";
import { courseForTemplate, getTemplate, templateIdOf, type LabCheck } from "./content";

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
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { labTemplate: true } });
  const id = templateIdOf(org.labTemplate);
  const t = id ? await getTemplate(id) : null;
  const name = t?.vendors.find((v) => v.key === s(key))?.name;
  return name ? prisma.vendor.findFirst({ where: { organizationId: orgId, name } }) : null;
}

async function runCheck(orgId: string, c: LabCheck, at: { labId: string; taskId: string }): Promise<boolean> {
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
    case "exercise_passed":
      return (await prisma.labExerciseAttempt.count({ where: { organizationId: orgId, labId: at.labId, taskId: at.taskId, passed: true } })) > 0;
    case "finding_recorded": {
      const ctl = await control(orgId, c.control);
      if (!ctl) return false;
      return (await prisma.finding.count({
        where: {
          organizationId: orgId, controlId: ctl.id,
          ...(c.withOwner ? { ownerId: { not: null } } : {}),
          ...(c.withDueDate ? { dueDate: { not: null } } : {}),
          ...(c.withRisk ? { riskId: { not: null } } : {}),
        },
      })) > 0;
    }
    case "task_created": {
      const ctl = await control(orgId, c.control);
      if (!ctl) return false;
      return (await prisma.task.count({
        where: { organizationId: orgId, controlId: ctl.id, assigneeId: { not: null }, dueDate: { not: null } },
      })) >= Number(c.min ?? 1);
    }
    case "risk_treatment_for_control": {
      // A risk linked to the control with a written treatment plan.
      return (await prisma.risk.count({
        where: { organizationId: orgId, treatmentPlan: { not: "" }, controls: { some: { control: { code: s(c.control) } } } },
      })) > 0;
    }
    default:
      return false;
  }
}

export type TaskResult = { id: string; done: boolean; completedAt: Date | null };
export type LabResult = { id: string; locked: boolean; tasks: TaskResult[] };

/** Runs every unlocked task's checks for the organisation's course and records first completions. */
export async function evaluateCourse(orgId: string, userId: string) {
  const access = await getAccess(userId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { labCourseId: true, labTemplate: true, labLevel: true } });
  const id = templateIdOf(org.labTemplate);
  const rendered = org.labCourseId && id ? await courseForTemplate(org.labCourseId, id, levelOf(org.labLevel)) : null;
  if (!rendered) return null;
  const { course, template } = rendered;

  const recorded = new Map(
    (await prisma.labTaskCompletion.findMany({ where: { organizationId: orgId, courseId: course.id } }))
      .map((r) => [`${r.labId}/${r.taskId}`, r.completedAt])
  );
  const labs: LabResult[] = [];
  const freeLabs = await freeLabsFor(course.id, course.freeLabs);
  for (const lab of course.labs) {
    const locked = !labUnlocked(access, freeLabs, lab.id);
    if (locked) {
      labs.push({ id: lab.id, locked, tasks: lab.tasks.map((t) => ({ id: t.id, done: false, completedAt: null })) });
      continue;
    }
    const tasks: TaskResult[] = [];
    for (const task of lab.tasks) {
      const key = `${lab.id}/${task.id}`;
      let done = true;
      for (const check of task.checks) if (!(await runCheck(orgId, check, { labId: lab.id, taskId: task.id }))) { done = false; break; }
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
    labs.push({ id: lab.id, locked, tasks });
  }
  return { course, template, labs, access };
}

/** A task's exercise for this organisation, with the lab and task it belongs to. */
export async function loadExercise(orgId: string, userId: string, labId: string, taskId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId }, select: { practice: true, labCourseId: true, labTemplate: true, labLevel: true, createdAt: true },
  });
  const id = templateIdOf(org?.labTemplate ?? null);
  if (!org?.practice || !org.labCourseId || !id) return null;
  const level = levelOf(org.labLevel);
  const rendered = await courseForTemplate(org.labCourseId, id, level);
  const lab = rendered?.course.labs.find((l) => l.id === labId);
  const task = lab?.tasks.find((t) => t.id === taskId);
  const profile = rendered?.template.industry;
  if (!lab || !task?.exercise || !profile) return null;
  const freeLabs = await freeLabsFor(rendered!.course.id, rendered!.course.freeLabs);
  if (!labUnlocked(await getAccess(userId), freeLabs, labId)) return null;
  const exercise = buildExercise(task.exercise, profile, orgId, org.createdAt, `${labId}/${taskId}`, level);
  return exercise ? { lab, task, exercise, level, company: rendered!.template.company.name } : null;
}
