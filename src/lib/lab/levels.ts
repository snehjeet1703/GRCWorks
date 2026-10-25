// Experience levels a learner picks at sign-up (ids are stored; labels are what learners see). They set how hard the exercises are and which extra tasks appear.
export const LAB_LEVELS = [
  { id: "beginner", label: "Beginner (0–2 years)", summary: "Smaller data sets, one of each kind of problem, hints open and detailed feedback." },
  { id: "practitioner", label: "Intermediate (3–5 years)", summary: "Full-size data sets with repeat problems and a few tricky rows." },
  { id: "senior", label: "Senior (6–10 years)", summary: "Larger data sets, more look-alike rows, less feedback, and tasks that tie findings to risks." },
  { id: "expert", label: "Leadership (11+ years)", summary: "The largest data sets, no false alarms allowed, pass/fail feedback only, and remediation planning." },
] as const;

export type LabLevel = (typeof LAB_LEVELS)[number]["id"];

export const isLabLevel = (v: unknown): v is LabLevel => LAB_LEVELS.some((l) => l.id === v);
export const levelOf = (v: string | null | undefined): LabLevel => (isLabLevel(v) ? v : "practitioner");
export const levelLabel = (v: string | null | undefined) => LAB_LEVELS.find((l) => l.id === levelOf(v))!.label;

// How each level changes an exercise.
export const LEVEL_TUNING: Record<LabLevel, {
  rows: number; // data-set size, as a multiple of the standard size
  issues: "unique" | "standard" | "more" | "most"; // how many problems are planted
  decoys: number; // how often clean rows look suspicious (multiple of the standard rate)
  falseAlarms: number; // clean rows that may be flagged and still pass
  feedback: "rows" | "types" | "totals" | "passfail";
}> = {
  beginner: { rows: 0.5, issues: "unique", decoys: 0, falseAlarms: 3, feedback: "rows" },
  practitioner: { rows: 1, issues: "standard", decoys: 1, falseAlarms: 2, feedback: "types" },
  senior: { rows: 1.5, issues: "more", decoys: 2, falseAlarms: 1, feedback: "totals" },
  expert: { rows: 2, issues: "most", decoys: 3, falseAlarms: 0, feedback: "passfail" },
};
