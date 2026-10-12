import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "./db";
import { HttpError } from "./api";
import { hashTrustToken } from "./trust-token";

export const INVITE_TTL_DAYS = 30;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = "vp_session";

export type PortalQuestion = {
  id: string;
  text: string;
  type: "TEXT" | "YES_NO" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "RATING" | "FILE_UPLOAD";
  required: boolean;
  options: string[];
  category?: string;
};

export type PortalAnswer = { questionId: string; value: string | string[] | number | boolean };

export const EDITABLE_STATUSES = new Set(["NOT_STARTED", "IN_PROGRESS"]);

function sessionKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for the vendor portal");
  return `${secret}:vendor-portal-session`;
}

function sign(payload: string) {
  return createHmac("sha256", sessionKey()).update(payload).digest("base64url");
}

export function inviteExpiry() {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return "your email";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export function portalBaseUrl(req: Request) {
  return (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/$/, "");
}

// Resolves a link token to its response. Expired, revoked or unknown tokens all look the same.
export async function loadPortalResponse(token: string) {
  if (!token || token.length > 200) return null;
  const response = await prisma.questionnaireResponse.findUnique({
    where: { inviteTokenHash: hashTrustToken(token) },
    include: {
      questionnaire: {
        select: {
          id: true, title: true, description: true, questions: true, organizationId: true,
          organization: { select: { name: true } },
        },
      },
      vendor: { select: { id: true, name: true } },
      files: { select: { id: true, questionId: true, fileName: true, fileSize: true, createdAt: true } },
    },
  });
  if (!response?.inviteExpiresAt || response.inviteExpiresAt < new Date()) return null;
  return response;
}

export type PortalResponse = NonNullable<Awaited<ReturnType<typeof loadPortalResponse>>>;

export function setPortalSession(res: NextResponse, responseId: string) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${responseId}.${exp}`;
  res.cookies.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function hasPortalSession(responseId: string) {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return false;
  const [id, exp, sig] = raw.split(".");
  if (!id || !exp || !sig || id !== responseId || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Every data-bearing portal endpoint needs both a live link and an email-verified session for it.
export async function requirePortalSession(token: string) {
  const response = await loadPortalResponse(token);
  if (!response) throw new HttpError(404, "This link is invalid or has expired");
  if (!(await hasPortalSession(response.id))) throw new HttpError(401, "Verify your email to continue");
  return response;
}

export function requireEditable(response: { status: string }) {
  if (!EDITABLE_STATUSES.has(response.status)) {
    throw new HttpError(409, "This questionnaire has been submitted and can no longer be changed");
  }
}

export function parseQuestions(raw: unknown): PortalQuestion[] {
  return Array.isArray(raw) ? (raw as PortalQuestion[]) : [];
}

const MAX_TEXT = 5000;

// Keeps only answers to real questions, in a shape that matches each question's type.
export function sanitizeAnswers(questions: PortalQuestion[], answers: unknown): PortalAnswer[] {
  if (!Array.isArray(answers)) throw new HttpError(400, "Answers must be a list");
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: PortalAnswer[] = [];
  for (const a of answers as PortalAnswer[]) {
    const q = byId.get(a?.questionId);
    if (!q || q.type === "FILE_UPLOAD") continue;
    const v = a.value;
    switch (q.type) {
      case "TEXT":
        if (typeof v !== "string" || v.length > MAX_TEXT) throw new HttpError(400, `Invalid answer for "${q.text}"`);
        break;
      case "YES_NO":
        if (v !== "Yes" && v !== "No") throw new HttpError(400, `Answer "${q.text}" with Yes or No`);
        break;
      case "SINGLE_CHOICE":
        if (typeof v !== "string" || !q.options.includes(v)) throw new HttpError(400, `Invalid choice for "${q.text}"`);
        break;
      case "MULTI_CHOICE":
        if (!Array.isArray(v) || v.some((x) => !q.options.includes(x))) throw new HttpError(400, `Invalid choices for "${q.text}"`);
        break;
      case "RATING":
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) throw new HttpError(400, `Rate "${q.text}" from 1 to 5`);
        break;
    }
    out.push({ questionId: q.id, value: v });
  }
  return out;
}

export function missingRequired(questions: PortalQuestion[], answers: PortalAnswer[], fileQuestionIds: Set<string>) {
  const answered = new Map(answers.map((a) => [a.questionId, a.value]));
  return questions.filter((q) => {
    if (!q.required) return false;
    if (q.type === "FILE_UPLOAD") return !fileQuestionIds.has(q.id);
    const v = answered.get(q.id);
    return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  });
}
