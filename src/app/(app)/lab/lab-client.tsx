"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Circle, Clock, Lightbulb, PlayCircle, RotateCcw } from "lucide-react";
import { Modal } from "@/components/modal";
import { LAB_LEVELS, levelLabel, type LabLevel } from "@/lib/lab/levels";
import { useToast } from "@/components/toast";

export type LabView = {
  id: string;
  title: string;
  minutes: number;
  objective: string;
  videoEmbed: string | null;
  tasks: { id: string; title: string; instructions: string; hints: string[]; link: string | null; done: boolean }[];
};

type Progress = { labs: { id: string; tasks: { id: string; done: boolean }[] }[] };

// Checks re-run while the page is open, so tasks tick off as the learner works in another tab.
const POLL_MS = 15_000;

export function LabClient({
  courseTitle, company, industries, level, labs: initial,
}: {
  level: LabLevel;
  courseTitle: string;
  company: { id: string; name: string; industry: string; description: string };
  industries: { id: string; industry: string; company: string; description: string }[];
  labs: LabView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [labs, setLabs] = useState(initial);
  const [openLab, setOpenLab] = useState<string | undefined>(() => initial.find((l) => l.tasks.some((t) => !t.done))?.id ?? initial[0]?.id);
  const [hints, setHints] = useState<Set<string>>(new Set());
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [nextTemplate, setNextTemplate] = useState(company.id);
  const [nextLevel, setNextLevel] = useState<LabLevel>(level);

  useEffect(() => setLabs(initial), [initial]);

  useEffect(() => {
    let stopped = false;
    async function refresh() {
      if (document.hidden) return;
      const res = await fetch("/api/lab/progress", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || stopped) return;
      const p: Progress = await res.json();
      const done = new Set(p.labs.flatMap((l) => l.tasks.filter((t) => t.done).map((t) => `${l.id}/${t.id}`)));
      setLabs((cur) => cur.map((l) => ({ ...l, tasks: l.tasks.map((t) => ({ ...t, done: done.has(`${l.id}/${t.id}`) })) })));
    }
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const total = labs.reduce((n, l) => n + l.tasks.length, 0);
  const finished = labs.reduce((n, l) => n + l.tasks.filter((t) => t.done).length, 0);
  const pct = total ? Math.round((finished / total) * 100) : 0;

  async function reset() {
    setResetting(true);
    const res = await fetch("/api/lab/reset", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: nextTemplate, level: nextLevel }),
    });
    setResetting(false);
    setConfirmReset(false);
    if (!res.ok) {
      toast.error((await res.json().catch(() => null))?.error ?? "Couldn't reset the practice company");
      return;
    }
    toast.success("Your practice company has been reset");
    router.refresh();
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{courseTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            You&apos;re the compliance lead at <strong>{company.name}</strong> ({company.industry}), a fictional company. {company.description}
          </p>
          <p className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            Level: {levelLabel(level)}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => { setNextTemplate(company.id); setNextLevel(level); setConfirmReset(true); }}>
          <RotateCcw className="mr-2 h-4 w-4" /> Start over, change industry or level
        </button>
      </div>

      <div className="card mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{finished} of {total} tasks done</span>
          <span className="text-gray-500">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Do each task in the platform as you would at work. Tasks tick off by themselves once the change is made; this page
          checks every few seconds while it&apos;s open.
        </p>
      </div>

      <ol className="space-y-3">
        {labs.map((lab, i) => {
          const done = lab.tasks.filter((t) => t.done).length;
          const complete = done === lab.tasks.length;
          const open = openLab === lab.id;
          return (
            <li key={lab.id} className="card p-0">
              <button
                className="flex w-full items-center gap-4 p-4 text-left"
                onClick={() => setOpenLab(open ? undefined : lab.id)}
                aria-expanded={open}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${complete ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                  {complete ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{lab.title}</span>
                  <span className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {lab.minutes} min</span>
                    <span>{done}/{lab.tasks.length} tasks</span>
                    {lab.videoEmbed && <span className="inline-flex items-center gap-1"><PlayCircle className="h-3 w-3" /> Intro video</span>}
                  </span>
                </span>
              </button>

              {open && (
                <div className="border-t border-gray-100 p-4 dark:border-gray-800">
                  <p className="text-sm text-gray-600 dark:text-gray-300">{lab.objective}</p>
                  {lab.videoEmbed && (
                    <div className="mt-4 aspect-video overflow-hidden rounded-lg bg-black">
                      <iframe
                        src={lab.videoEmbed}
                        title={`${lab.title}: what you'll do`}
                        className="h-full w-full"
                        allow="encrypted-media; picture-in-picture; fullscreen"
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-presentation"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <ul className="mt-4 space-y-3">
                    {lab.tasks.map((t) => {
                      const key = `${lab.id}/${t.id}`;
                      return (
                        <li key={t.id} className="flex gap-3">
                          {t.done
                            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-label="Done" />
                            : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" aria-label="Not done yet" />}
                          <div className="min-w-0">
                            <p className={`text-sm font-medium ${t.done ? "text-gray-500 line-through" : ""}`}>{t.title}</p>
                            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{t.instructions}</p>
                            {t.link && !t.done && (
                              <Link href={t.link} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                                {t.link.startsWith("/lab/exercise/") ? "Open the data and start reviewing" : "Go to this task"} <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            )}
                            {t.hints.length > 0 && !t.done && (
                              hints.has(key) ? (
                                <ul className="mt-2 space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                  {t.hints.map((h) => <li key={h}>{h}</li>)}
                                </ul>
                              ) : (
                                <button
                                  className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                                  onClick={() => setHints((s) => new Set(s).add(key))}
                                >
                                  <Lightbulb className="h-3 w-3" /> Show a hint
                                </button>
                              )
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Modal open={confirmReset} onClose={() => !resetting && setConfirmReset(false)} title="Start over" size="sm">
        <p className="text-sm text-muted-foreground">
          You get a fresh practice company as it was on day one, and your lab progress starts again. Your account stays.
        </p>
        <label htmlFor="next-industry" className="mt-4 mb-1 block text-sm font-medium">Industry</label>
        <select id="next-industry" className="input" value={nextTemplate} onChange={(e) => setNextTemplate(e.target.value)}>
          {industries.map((i) => <option key={i.id} value={i.id}>{i.industry} ({i.company})</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">{industries.find((i) => i.id === nextTemplate)?.description}</p>
        <label htmlFor="next-level" className="mt-4 mb-1 block text-sm font-medium">Experience level</label>
        <select id="next-level" className="input" value={nextLevel} onChange={(e) => setNextLevel(e.target.value as LabLevel)}>
          {LAB_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">{LAB_LEVELS.find((l) => l.id === nextLevel)?.summary}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setConfirmReset(false)} className="btn-secondary" disabled={resetting}>Cancel</button>
          <button type="button" onClick={reset} className="btn-primary" disabled={resetting}>
            {resetting ? "Setting up..." : "Start over"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
