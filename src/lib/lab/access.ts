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

// Shown to free learners on locked labs. Set in the environment so prices change without a release.
export const pricingText = () =>
  process.env.LAB_PRICING_TEXT ??
  "Individual: ₹2,999 / $59 for 12 months. Labs + interview prep: ₹4,499 / $89. Teams: ₹1,999 / $39 per person per year (5+ people).";
export const paymentText = () =>
  process.env.LAB_PAYMENT_TEXT ??
  "Email hello@grcworks.io to pay by UPI or bank transfer. You'll get an access code to enter here.";

export function isLabAdmin(email: string | null | undefined) {
  const admins = (process.env.LAB_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
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
