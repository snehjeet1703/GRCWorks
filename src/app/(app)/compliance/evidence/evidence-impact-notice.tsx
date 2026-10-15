"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";

export type Impact = {
  controls: { id: string; code: string; title: string }[];
  slots: { periodId: string; periodName: string; periodClosed: boolean; code: string; label: string; status: string }[];
  protected: boolean;
  canOverride: boolean;
};

const STATUS: Record<string, string> = { APPROVED: "approved", IN_REVIEW: "in review", CHANGES_REQUESTED: "sent back" };

/**
 * Loads and explains what removing evidence (deleting it, or unlinking it from `remove` controls) reopens.
 * Reports whether the action is blocked so the caller can disable its confirm button.
 */
export function EvidenceImpactNotice({
  evidenceId, remove, verb, onState,
}: {
  evidenceId: string;
  remove?: string[];
  verb: "Deleting" | "Unlinking";
  onState: (s: { loading: boolean; blocked: boolean }) => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState(false);
  const key = remove ? remove.join(",") : null;

  useEffect(() => {
    let cancelled = false;
    setImpact(null); setError(false);
    if (key === "") { onState({ loading: false, blocked: false }); return; }
    onState({ loading: true, blocked: false });
    fetch(`/api/evidence/${evidenceId}/impact${key !== null ? `?remove=${encodeURIComponent(key)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Impact) => {
        if (cancelled) return;
        setImpact(d);
        onState({ loading: false, blocked: d.protected && !d.canOverride });
      })
      .catch(() => { if (!cancelled) { setError(true); onState({ loading: false, blocked: false }); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceId, key]);

  if (key === "") return null;
  if (error) return <p className="text-xs text-gray-500">Couldn&apos;t check what this affects. The server still reopens anything that depended on it.</p>;
  if (!impact) return <p className="text-xs text-gray-500">Checking what depends on this evidence…</p>;
  if (!impact.controls.length && !impact.slots.length) {
    return <p className="text-xs text-gray-500">No closed controls or audit approvals depend only on this evidence.</p>;
  }

  const closedSlots = impact.slots.filter((s) => s.periodClosed && s.status === "APPROVED");
  return (
    <div className="space-y-2">
      {impact.protected && (
        <div className={`flex gap-2 rounded-lg border p-3 text-sm ${impact.canOverride ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"}`}>
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This is the approved evidence for {closedSlots.length === 1 ? "a finished audit period" : `${closedSlots.length} periods of finished audits`}.{" "}
            {impact.canOverride
              ? "As an admin you can still remove it, but the audit record will show those periods as missing."
              : "Only an admin can remove it."}
          </p>
        </div>
      )}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-medium"><AlertTriangle className="h-4 w-4" /> {verb} it will reopen:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {impact.controls.map((c) => (
            <li key={c.id}><span className="font-mono">{c.code}</span> {c.title}: back to <em>In progress</em> (no other valid evidence)</li>
          ))}
          {impact.slots.map((s, i) => (
            <li key={i}>
              {s.periodName} · <span className="font-mono">{s.code}</span> · {s.label}: {STATUS[s.status] ?? s.status} → missing
              {s.periodClosed && <span className="font-medium"> (audit finished)</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1.5">Owners will see these in their tasks again. Everything is recorded in the audit log.</p>
      </div>
    </div>
  );
}
