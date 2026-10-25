import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { IndustryProfile } from "./exercises";
import type { LabLevel } from "./levels";

// Lab mode turns this install into a practice environment: open sign-up, one practice company per learner.
// Course content lives outside this repo (grcworks-labs), in the folder LAB_CONTENT_DIR points at.
export const labMode = process.env.LAB_MODE === "true";

export type LabCheck = { type: string; [field: string]: unknown };
// `link` is the platform page where the task is done.
// `exercise` names a data-review exercise (see exercises.ts) the learner completes on the Labs page.
export type LabTask = {
  id: string; title: string; instructions: string; hints: string[]; link?: string; exercise?: string; checks: LabCheck[];
  // Experience levels the task is for; all levels when absent.
  levels?: LabLevel[];
};
export type Lab = { id: string; title: string; minutes: number; objective: string; videoUrl?: string; tasks: LabTask[] };
// `templates` are the practice companies (one per industry) a learner can pick; the first is the default.
export type Course = { id: string; title: string; templates: string[]; freeLabs: string[]; labs: Lab[] };

type TeamMember = { key: string; name: string; title: string; role: "Admin" | "Editor" | "Viewer" | "Auditor" };
export type LabTemplate = {
  id: string;
  version: number;
  company: { name: string; industry: string; industryKey?: string; employees: number; cloud: string; description: string };
  // Values for {{placeholders}} in lab text and checks, so the same labs fit every company.
  vars?: Record<string, string>;
  // Industry profile that exercise data sets are generated from.
  industry?: IndustryProfile;
  frameworks: string[];
  team: TeamMember[];
  controls: { code: string; status: string; owner: string | null; frequency: string; notes?: string }[];
  customControls: {
    code: string; title: string; status: string; owner: string | null; frequency: string;
    mapsTo: { framework: string; requirement: string }[];
  }[];
  unmappedOnPurpose: { code: string; framework: string; requirement: string }[];
  policies: { title: string; status: string; controls: string[] }[];
  evidence: {
    file: string; controls: string[]; periodStart: string; status: string; by: string; slotReview?: string;
  }[];
  risks: { title: string; category: string; likelihood: number; impact: number; treatment: string; controls: string[] }[];
  vendors: {
    key: string; name: string; category: string; criticality: string; status: string; dataAccess: boolean; dataTypes: string;
  }[];
  questionnaireResponses: {
    vendor: string; questionnaire: string; status: string; answers: Record<string, string | string[]>;
  }[];
  auditPeriod: { name: string; framework: string; lengthMonths: number; startsMonthsAgo: number };
};

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function contentDir() {
  const dir = process.env.LAB_CONTENT_DIR;
  if (!dir) throw new Error("LAB_CONTENT_DIR is not set");
  return path.resolve(dir);
}

async function readJson<T>(...parts: string[]): Promise<T> {
  for (const p of parts) if (!SAFE_ID.test(p.replace(/\.json$/, ""))) throw new Error(`Invalid lab content id: ${p}`);
  return JSON.parse(await readFile(path.join(contentDir(), ...parts), "utf8")) as T;
}

// Content changes only on redeploy, so it's read once per server process.
let cache: Promise<{ courses: Course[]; templates: Map<string, LabTemplate> }> | null = null;

async function load() {
  const courseIds = (await readdir(path.join(contentDir(), "courses"), { withFileTypes: true }))
    .filter((d) => d.isDirectory() && SAFE_ID.test(d.name))
    .map((d) => d.name)
    .sort();
  const courses: Course[] = [];
  const templates = new Map<string, LabTemplate>();
  for (const id of courseIds) {
    const raw = await readJson<{
      id: string; title: string; template: string; templates?: string[]; freePreviewLabs?: string[]; labs: string[];
    }>("courses", id, "course.json");
    const labs = await Promise.all(raw.labs.map((labId) => readJson<Lab>("courses", id, "labs", `${labId}.json`)));
    const ids = raw.templates?.length ? raw.templates : [raw.template];
    courses.push({ id: raw.id, title: raw.title, templates: ids, freeLabs: raw.freePreviewLabs ?? [], labs });
    for (const t of ids) {
      if (!templates.has(t)) templates.set(t, await readJson<LabTemplate>("templates", t, "template.json"));
    }
  }
  return { courses, templates };
}

export function labContent() {
  if (!cache || process.env.NODE_ENV !== "production") cache = load();
  return cache;
}

export async function getCourse(courseId: string) {
  return (await labContent()).courses.find((c) => c.id === courseId) ?? null;
}

export async function getTemplate(templateId: string) {
  return (await labContent()).templates.get(templateId) ?? null;
}

// Replaces {{name}} in every string (titles, instructions and check values) with the company's own values.
function fill<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === "string") return value.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m) as T;
  if (Array.isArray(value)) return value.map((v) => fill(v, vars)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)])) as T;
  }
  return value;
}

/** The course with its labs written for one practice company, keeping only the tasks for the learner's level. */
export async function courseForTemplate(courseId: string, templateId: string, level?: LabLevel) {
  const course = await getCourse(courseId);
  const template = await getTemplate(templateId);
  if (!course || !template || !course.templates.includes(templateId)) return null;
  const labs = fill(course.labs, { company: template.company.name, ...template.vars })
    .map((l) => ({ ...l, tasks: l.tasks.filter((t) => !level || !t.levels || t.levels.includes(level)) }));
  return { course: { ...course, labs }, template };
}

/** The template id stored on a practice organisation ("<id>@<version>"). */
export const templateIdOf = (labTemplate: string | null) => labTemplate?.split("@")[0] ?? null;

export async function industryChoices(courseId: string) {
  const course = await getCourse(courseId);
  if (!course) return [];
  const all = await Promise.all(course.templates.map(async (id) => ({ id, t: await getTemplate(id) })));
  return all.flatMap(({ id, t }) => (t ? [{ id, industry: t.company.industry, company: t.company.name, description: t.company.description }] : []));
}

// Only privacy-enhanced YouTube embeds are allowed, so the CSP can name one frame source.
export function videoEmbedUrl(url?: string) {
  if (!url) return null;
  const m = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}
