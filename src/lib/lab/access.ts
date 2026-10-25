import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";

// Paid lab access without a payment integration: the admin takes payment offline and issues an access code (or
// grants access directly); the learner redeems it. No access row, or an expired one, means the free plan.

export const PLANS = {
  free: { label: "Free", rank: 0 },
  individual: { label: "Individual", rank: 1 },
  team: { label: "Team", rank: 1 },
  bundle: { label: "Labs + interview prep", rank: 2 },
} as const;
export type PaidPlan = "individual" | "bundle" | "team";
export const PAID_PLANS: PaidPlan[] = ["individual", "bundle", "team"];

// ─── Settings (changed in the command centre; environment values are the defaults) ───

const DEFAULT_PRICING =
  "Individual: ₹2,999 / $59 for 12 months. Labs + interview prep: ₹4,499 / $89. Teams: ₹1,999 / $39 per person per year (5+ people).";
const DEFAULT_PAYMENT = "Pay by UPI or bank transfer, then tell us your payment reference below and we'll unlock your account.";

export type LabSettingsView = {
  pricingText: string; paymentText: string; upiId: string; freeLabs: Record<string, string[]>;
  defaultMonths: number; signupOpen: boolean; admins: string[]; updatedBy: string; updatedAt: string | null;
};

export async function labSettings(): Promise<LabSettingsView> {
  const row = await prisma.labSettings.findUnique({ where: { id: "default" } });
  return {
    pricingText: row?.pricingText || process.env.LAB_PRICING_TEXT || DEFAULT_PRICING,
    paymentText: row?.paymentText || process.env.LAB_PAYMENT_TEXT || DEFAULT_PAYMENT,
    upiId: row?.upiId ?? "",
    freeLabs: (row?.freeLabs as Record<string, string[]> | null) ?? {},
    defaultMonths: row?.defaultMonths ?? 12,
    signupOpen: row?.signupOpen ?? true,
    admins: (row?.admins as string[] | null) ?? [],
    updatedBy: row?.updatedBy ?? "",
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/** Admins from LAB_ADMIN_EMAILS can't be removed in the app, so nobody can lock everyone out. */
export const ownerAdmins = () =>
  (process.env.LAB_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function isLabAdmin(email: string | null | undefined) {
  if (!email) return false;
  const e = email.toLowerCase();
  return ownerAdmins().includes(e) || (await labSettings()).admins.includes(e);
}

/** A course's free labs: the admin's choice if set, otherwise the course's own preview labs. */
export async function freeLabsFor(courseId: string, courseDefault: string[]) {
  return (await labSettings()).freeLabs[courseId] ?? courseDefault;
}

export type Access = { plan: keyof typeof PLANS; paid: boolean; expiresAt: Date | null };

export async function getAccess(userId: string): Promise<Access> {
  const row = await prisma.labAccess.findUnique({ where: { userId } });
  if (!row || row.expiresAt <= new Date()) return { plan: "free", paid: false, expiresAt: row?.expiresAt ?? null };
  return { plan: row.plan as PaidPlan, paid: true, expiresAt: row.expiresAt };
}

/** Free learners get the course's preview labs; paid learners get every lab. */
export const labUnlocked = (access: Access, freeLabs: string[], labId: string) => access.paid || freeLabs.includes(labId);

const addMonths = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
};

// Adds months on top of any access still running, and keeps the better plan.
export async function extendAccess(userId: string, plan: PaidPlan, months: number, extra: { teamCodeId?: string; note?: string } = {}) {
  const current = await prisma.labAccess.findUnique({ where: { userId } });
  const now = new Date();
  const from = current && current.expiresAt > now ? current.expiresAt : now;
  const keepPlan = current && current.expiresAt > now && PLANS[current.plan as PaidPlan].rank > PLANS[plan].rank;
  const data = {
    plan: keepPlan ? current!.plan : plan,
    expiresAt: addMonths(from, months),
    ...(extra.teamCodeId ? { teamCodeId: extra.teamCodeId } : {}),
    ...(extra.note ? { note: extra.note } : {}),
  };
  return prisma.labAccess.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

// Unambiguous characters only (no 0/O, 1/I/L), so codes survive being read out or typed from a screenshot.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newCode() {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `GRC-${part()}-${part()}-${part()}`;
}
// Accepts "grc abcd efgh jkmn", "ABCDEFGHJKMN" and the like.
export function normaliseCode(raw: string) {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 15 && s.startsWith("GRC")) s = s.slice(3);
  return `GRC-${s.replace(/(.{4})(?=.)/g, "$1-")}`;
}

/** Redeems a code for the user. Seats are claimed atomically, so a team code can't be over-used. */
export async function redeemCode(userId: string, raw: string) {
  const code = normaliseCode(raw);
  const row = await prisma.labAccessCode.findUnique({ where: { code } });
  if (!row || row.disabled || (row.redeemBy && row.redeemBy < new Date())) throw new HttpError(400, "That code isn't valid or has expired.");
  if (await prisma.labRedemption.findUnique({ where: { codeId_userId: { codeId: row.id, userId } } })) {
    throw new HttpError(409, "You've already used this code.");
  }
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.$executeRaw`UPDATE lab_access_codes SET used = used + 1 WHERE id = ${row.id} AND used < seats AND NOT disabled`;
    if (claimed === 0) throw new HttpError(400, "All seats on this code have been used.");
    await tx.labRedemption.create({ data: { codeId: row.id, userId } });
    const current = await tx.labAccess.findUnique({ where: { userId } });
    const now = new Date();
    const from = current && current.expiresAt > now ? current.expiresAt : now;
    const plan = row.plan as PaidPlan;
    const keepPlan = current && current.expiresAt > now && PLANS[current.plan as PaidPlan].rank > PLANS[plan].rank;
    const data = {
      plan: keepPlan ? current!.plan : plan,
      expiresAt: addMonths(from, row.months),
      ...(plan === "team" ? { teamCodeId: row.id } : {}),
    };
    return tx.labAccess.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  });
}

/** For admin API routes: the signed-in user, if they're a lab admin (checked live). */
export async function requireLabAdmin() {
  const { requireSession } = await import("@/lib/api");
  const { labMode } = await import("./content");
  if (!labMode) throw new HttpError(404, "Not found");
  const user = await requireSession();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!row || !(await isLabAdmin(row.email))) throw new HttpError(403, "Lab admins only");
  return { ...user, email: row.email };
}
