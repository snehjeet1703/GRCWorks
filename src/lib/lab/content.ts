import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Lab mode turns this install into a practice environment: open sign-up, one practice company per learner.
// Course content lives outside this repo (grcworks-labs), in the folder LAB_CONTENT_DIR points at.
export const labMode = process.env.LAB_MODE === "true";

export type LabCheck = { type: string; [field: string]: unknown };
export type LabTask = { id: string; title: string; instructions: string; hints: string[]; checks: LabCheck[] };
export type Lab = { id: string; title: string; minutes: number; objective: string; videoUrl?: string; tasks: LabTask[] };
export type Course = { id: string; title: string; template: string; labs: Lab[] };

type TeamMember = { key: string; name: string; title: string; role: "Admin" | "Editor" | "Viewer" | "Auditor" };
export type LabTemplate = {
  id: string;
  version: number;
  company: { name: string; industry: string; employees: number; cloud: string; description: string };
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
    const raw = await readJson<{ id: string; title: string; template: string; labs: string[] }>("courses", id, "course.json");
    const labs = await Promise.all(raw.labs.map((labId) => readJson<Lab>("courses", id, "labs", `${labId}.json`)));
    courses.push({ id: raw.id, title: raw.title, template: raw.template, labs });
    if (!templates.has(raw.template)) {
      templates.set(raw.template, await readJson<LabTemplate>("templates", raw.template, "template.json"));
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

// Only privacy-enhanced YouTube embeds are allowed, so the CSP can name one frame source.
export function videoEmbedUrl(url?: string) {
  if (!url) return null;
  const m = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}
