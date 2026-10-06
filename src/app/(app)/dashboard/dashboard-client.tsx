"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shield, AlertTriangle, ScrollText, FileCheck, Bug, ShieldOff, Activity } from "lucide-react";
import { getRiskScore, getRiskLevel, getRiskColor } from "@/lib/utils";
import { DonutChart, HorizontalBarChart } from "@/components/charts";

type Framework = {
  id: string;
  name: string;
  citations: { frameworkControlId: string; controlId: string }[];
};
type Control = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "IMPLEMENTED" | "NOT_APPLICABLE";
  evidenceCount: number;
  risksCount: number;
  policiesCount: number;
};
type Risk = {
  id: string;
  title: string;
  likelihood: number;
  impact: number;
  inherentScore: number;
  residualScore: number;
  riskStatus: string;
  treatment: string;
  ownerName: string | null;
  controlIds: string[];
  updatedAt: string;
};
type Policy = {
  id: string;
  title: string;
  status: string;
  controlIds: string[];
};
type Evidence = { id: string; controlId: string; status: string; validUntil: string | null };
type Finding = { id: string; severity: string; status: string; controlId: string | null };
type ExceptionSummary = { id: string; status: string; validUntil: string };
type Log = {
  id: string;
  createdAt: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
};

const STATUS_COLORS = {
  IMPLEMENTED: "#059669",
  IN_PROGRESS: "#2563eb",
  NOT_STARTED: "#9ca3af",
  NOT_APPLICABLE: "#d1d5db",
} as const;

const TIME_RANGES: { label: string; days: number }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const ARTICLES: Record<string, string> = {
  Risk: "a", Policy: "a", Control: "a", Evidence: "an",
  Organization: "an", User: "a", Finding: "a", ControlException: "a",
};
const HREFS: Record<string, string> = {
  Risk: "/risks", Policy: "/governance", Control: "/compliance",
  Evidence: "/compliance/evidence", Organization: "/settings", User: "/settings",
  Finding: "/findings", ControlException: "/exceptions",
};

function HealthBar({ label, good, warn, bad, href }: { label: string; good: number; warn: number; bad: number; href: string }) {
  const total = good + warn + bad;
  if (total === 0) return null;
  const gp = (good / total) * 100;
  const wp = (warn / total) * 100;
  return (
    <Link href={href} className="block group">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-medium text-gray-700 group-hover:text-brand-700">{label}</span>
        <span className="font-mono text-[11px] text-gray-400">{good}/{total} healthy</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
        {gp > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${gp}%` }} />}
        {wp > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${wp}%` }} />}
        {(100 - gp - wp) > 0 && <div className="bg-red-400 transition-all" style={{ width: `${100 - gp - wp}%` }} />}
      </div>
    </Link>
  );
}

export function DashboardClient({
  frameworks,
  controls,
  risks,
  policies,
  evidence,
  findings,
  exceptions,
  auditLogs,
}: {
  frameworks: Framework[];
  controls: Control[];
  risks: Risk[];
  policies: Policy[];
  evidence: Evidence[];
  findings: Finding[];
  exceptions: ExceptionSummary[];
  auditLogs: Log[];
}) {
  const [frameworkId, setFrameworkId] = useState<string>("");
  const [days, setDays] = useState<number>(30);

  const selectedFramework = frameworks.find((f) => f.id === frameworkId) ?? null;

  const controlById = useMemo(() => {
    const m = new Map<string, Control>();
    for (const c of controls) m.set(c.id, c);
    return m;
  }, [controls]);

  const scopeUnderlyingControlIds = selectedFramework
    ? new Set(selectedFramework.citations.map((c) => c.controlId))
    : null;

  const scopedCitations = selectedFramework
    ? selectedFramework.citations
        .map((c) => controlById.get(c.controlId))
        .filter((c): c is Control => !!c)
    : controls;

  const scopedRisks = scopeUnderlyingControlIds
    ? risks.filter((r) => r.controlIds.some((id) => scopeUnderlyingControlIds.has(id)))
    : risks;
  const scopedPolicies = scopeUnderlyingControlIds
    ? policies.filter((p) => p.controlIds.some((id) => scopeUnderlyingControlIds.has(id)))
    : policies;
  const scopedEvidence = scopeUnderlyingControlIds
    ? evidence.filter((e) => scopeUnderlyingControlIds.has(e.controlId))
    : evidence;
  const scopedFindings = scopeUnderlyingControlIds
    ? findings.filter((f) => f.controlId && scopeUnderlyingControlIds.has(f.controlId))
    : findings;

  const statusCounts = useMemo(() => {
    const c = { IMPLEMENTED: 0, IN_PROGRESS: 0, NOT_STARTED: 0, NOT_APPLICABLE: 0 };
    for (const ctl of scopedCitations) c[ctl.status]++;
    return c;
  }, [scopedCitations]);

  const donutSlices = [
    { label: "Implemented", value: statusCounts.IMPLEMENTED, color: STATUS_COLORS.IMPLEMENTED },
    { label: "In progress", value: statusCounts.IN_PROGRESS, color: STATUS_COLORS.IN_PROGRESS },
    { label: "Not started", value: statusCounts.NOT_STARTED, color: STATUS_COLORS.NOT_STARTED },
    { label: "N/A", value: statusCounts.NOT_APPLICABLE, color: STATUS_COLORS.NOT_APPLICABLE },
  ];

  const applicableTotal = scopedCitations.length - statusCounts.NOT_APPLICABLE;
  const coveragePercent =
    applicableTotal > 0
      ? Math.round((statusCounts.IMPLEMENTED / applicableTotal) * 100)
      : 0;

  const frameworkBars = frameworks.map((f) => {
    let implemented = 0;
    let applicable = 0;
    for (const cite of f.citations) {
      const c = controlById.get(cite.controlId);
      if (!c) continue;
      if (c.status === "NOT_APPLICABLE") continue;
      applicable++;
      if (c.status === "IMPLEMENTED") implemented++;
    }
    return { label: f.name, value: implemented, total: applicable };
  });

  // Health widget computations
  const controlHealth = useMemo(() => {
    const implemented = statusCounts.IMPLEMENTED;
    const inProgress = statusCounts.IN_PROGRESS;
    const notStarted = statusCounts.NOT_STARTED;
    return { good: implemented, warn: inProgress, bad: notStarted };
  }, [statusCounts]);

  const evidenceHealth = useMemo(() => {
    const now = new Date();
    let valid = 0, expiring = 0, expired = 0;
    for (const e of scopedEvidence) {
      if (e.status === "REJECTED") { expired++; continue; }
      if (e.validUntil) {
        const until = new Date(e.validUntil);
        if (until < now) { expired++; continue; }
        const daysLeft = (until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysLeft <= 30) { expiring++; continue; }
      }
      valid++;
    }
    return { good: valid, warn: expiring, bad: expired };
  }, [scopedEvidence]);

  const riskHealth = useMemo(() => {
    let closed = 0, inTreatment = 0, open = 0;
    for (const r of scopedRisks) {
      if (r.riskStatus === "CLOSED" || r.riskStatus === "ACCEPTED") closed++;
      else if (r.riskStatus === "IN_TREATMENT") inTreatment++;
      else open++;
    }
    return { good: closed, warn: inTreatment, bad: open };
  }, [scopedRisks]);

  const findingHealth = useMemo(() => {
    let resolved = 0, inProgress = 0, open = 0;
    for (const f of scopedFindings) {
      if (f.status === "CLOSED" || f.status === "RESOLVED" || f.status === "ACCEPTED") resolved++;
      else if (f.status === "IN_PROGRESS") inProgress++;
      else open++;
    }
    return { good: resolved, warn: inProgress, bad: open };
  }, [scopedFindings]);

  const exceptionHealth = useMemo(() => {
    const now = new Date();
    let approved = 0, pending = 0, expired = 0;
    for (const ex of exceptions) {
      if (ex.status === "APPROVED") {
        if (new Date(ex.validUntil) < now) expired++;
        else approved++;
      } else if (ex.status === "REQUESTED") pending++;
      else expired++;
    }
    return { good: approved, warn: pending, bad: expired };
  }, [exceptions]);

  // Recent activity
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const scopedRiskIdSet = new Set(scopedRisks.map((r) => r.id));
  const scopedPolicyIdSet = new Set(scopedPolicies.map((p) => p.id));
  const scopedEvidenceIdSet = new Set(scopedEvidence.map((e) => e.id));
  const scopedFrameworkIds = selectedFramework ? new Set([selectedFramework.id]) : null;

  const filteredLogs = auditLogs.filter((l) => {
    if (new Date(l.createdAt).getTime() < cutoff) return false;
    if (!scopeUnderlyingControlIds) return true;
    switch (l.entityType) {
      case "Control": return scopeUnderlyingControlIds.has(l.entityId);
      case "Risk": return scopedRiskIdSet.has(l.entityId);
      case "Policy": return scopedPolicyIdSet.has(l.entityId);
      case "Evidence": return scopedEvidenceIdSet.has(l.entityId);
      case "Framework": return scopedFrameworkIds!.has(l.entityId);
      default: return false;
    }
  });

  const topRisks = [...scopedRisks]
    .map((r) => ({ ...r, score: r.inherentScore || getRiskScore(r.likelihood, r.impact) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const cards = [
    {
      label: selectedFramework ? "Requirements met" : "Controls implemented",
      value: `${statusCounts.IMPLEMENTED}/${scopedCitations.length}`,
      subtext: `${coveragePercent}% of applicable`,
      icon: Shield,
      color: "text-brand-600 bg-brand-50",
    },
    {
      label: "Active risks",
      value: scopedRisks.length,
      subtext: selectedFramework ? `Linked to ${selectedFramework.name} controls` : `Across all frameworks`,
      icon: AlertTriangle,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Open findings",
      value: scopedFindings.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length,
      subtext: `${scopedFindings.filter((f) => f.severity === "CRITICAL" && f.status !== "CLOSED").length} critical`,
      icon: Bug,
      color: "text-red-600 bg-red-50",
    },
    {
      label: "Evidence collected",
      value: scopedEvidence.length,
      subtext: `${evidenceHealth.bad} expired · ${evidenceHealth.warn} expiring`,
      icon: FileCheck,
      color: "text-violet-600 bg-violet-50",
    },
  ];

  return (
    <div>
      {/* Header + filters */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="mt-0.5 text-[13.5px] text-gray-500">
            {selectedFramework
              ? `${selectedFramework.name} posture`
              : "Governance, risk, and compliance posture"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Framework"
            value={frameworkId}
            onChange={(e) => setFrameworkId(e.target.value)}
            className="input w-auto text-[13px]"
          >
            <option value="">All frameworks</option>
            {frameworks.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <div className="inline-flex rounded-md border border-gray-200 bg-white overflow-hidden">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.days}
                onClick={() => setDays(tr.days)}
                className={
                  days === tr.days
                    ? "px-3 py-1.5 text-xs font-medium bg-brand-600 text-white"
                    : "px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                }
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        {cards.map((card) => (
          <div key={card.label} className="card !p-[18px]">
            <div className="flex items-start gap-3.5">
              <div className={`rounded-[10px] p-2.5 ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] text-gray-400 font-medium">{card.label}</p>
                <p className="text-2xl font-bold tracking-tight text-gray-900 mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>{card.value}</p>
                <p className="text-[11.5px] text-gray-400 truncate mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>{card.subtext}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Health widgets */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">Program health</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
          <HealthBar label="Controls" good={controlHealth.good} warn={controlHealth.warn} bad={controlHealth.bad} href="/compliance" />
          <HealthBar label="Evidence" good={evidenceHealth.good} warn={evidenceHealth.warn} bad={evidenceHealth.bad} href="/compliance/evidence" />
          <HealthBar label="Risks" good={riskHealth.good} warn={riskHealth.warn} bad={riskHealth.bad} href="/risks" />
          <HealthBar label="Findings" good={findingHealth.good} warn={findingHealth.warn} bad={findingHealth.bad} href="/findings" />
          <HealthBar label="Exceptions" good={exceptionHealth.good} warn={exceptionHealth.warn} bad={exceptionHealth.bad} href="/exceptions" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-5">
        <div className="card">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Control status</h2>
            <span className="text-xs text-gray-500">
              {selectedFramework ? selectedFramework.name : "All frameworks"}
            </span>
          </div>
          <div className="flex justify-center py-2">
            <DonutChart
              slices={donutSlices}
              centerLabel={`${coveragePercent}%`}
              centerSubLabel="implemented"
            />
          </div>
        </div>

        <div className="card">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Framework coverage</h2>
            <Link href="/compliance" className="text-xs font-medium text-brand-700 hover:underline">
              View all &rarr;
            </Link>
          </div>
          <HorizontalBarChart
            bars={frameworkBars}
            highlightLabel={selectedFramework?.name}
          />
        </div>
      </div>

      {/* Two-column: Top risks + Recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Top risks
            {selectedFramework && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                — linked to {selectedFramework.name}
              </span>
            )}
          </h2>
          <div className="space-y-1.5">
            {topRisks.map((risk) => {
              const level = getRiskLevel(risk.score);
              return (
                <div
                  key={risk.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{risk.title}</p>
                    <p className="text-[11.5px] text-gray-400 mt-0.5">
                      {risk.ownerName ?? "Unassigned"}
                      {risk.residualScore > 0 && (
                        <span className="ml-1.5">&middot; Residual: {risk.residualScore}</span>
                      )}
                    </p>
                  </div>
                  <span className={`ml-3 font-mono text-[11px] font-medium rounded-full px-2.5 py-0.5 ${getRiskColor(level)}`}>
                    {risk.score} {level}
                  </span>
                </div>
              );
            })}
            {topRisks.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">
                No risks {selectedFramework ? "linked to this framework" : "registered"} yet.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Recent activity
            <span className="ml-2 text-xs font-normal text-gray-400">
              last {days} days
            </span>
          </h2>
          <div className="divide-y divide-gray-50">
            {filteredLogs.slice(0, 10).map((log) => {
              const article = ARTICLES[log.entityType] ?? "a";
              const verb =
                log.action === "CREATE"
                  ? "created"
                  : log.action === "UPDATE"
                  ? "updated"
                  : log.action === "DELETE"
                  ? "deleted"
                  : log.action === "APPROVE"
                  ? "approved"
                  : "acted on";
              const href = HREFS[log.entityType];
              return (
                <div key={log.id} className="flex items-start gap-2.5 py-2.5 text-[13px]">
                  <div className="mt-[7px] h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-700">
                      <span className="font-medium">
                        {log.userName || "(deleted user)"}
                      </span>{" "}
                      {verb} {article} {log.entityType.toLowerCase().replace("controlexception", "exception")}
                      {log.entityName && (
                        <>
                          {" "}
                          {href && log.action !== "DELETE" ? (
                            <Link
                              href={href}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              &quot;{log.entityName}&quot;
                            </Link>
                          ) : (
                            <span className="font-medium text-gray-900">
                              &quot;{log.entityName}&quot;
                            </span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
            {filteredLogs.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">
                No activity in the last {days} days
                {selectedFramework ? ` for ${selectedFramework.name}` : ""}.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
