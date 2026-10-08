"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheck, AlertTriangle, FileCheck, FileSearch, Activity, ArrowRight } from "lucide-react";
import { cn, getRiskScore, getRiskLevel, getRiskColor } from "@/lib/utils";
import { AreaTrendChart, DonutChart, GroupedBarChart, HorizontalBarChart } from "@/components/charts";

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
type Policy = { id: string; title: string; status: string; controlIds: string[] };
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
  IMPLEMENTED: "var(--chart-1)",
  IN_PROGRESS: "var(--chart-2)",
  NOT_STARTED: "var(--chart-4)",
  NOT_APPLICABLE: "var(--chart-5)",
} as const;

const TIME_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

const ARTICLES: Record<string, string> = {
  Risk: "a", Policy: "a", Control: "a", Evidence: "an",
  Organization: "an", User: "a", Finding: "a", ControlException: "a",
};
const HREFS: Record<string, string> = {
  Risk: "/risks", Policy: "/governance", Control: "/compliance",
  Evidence: "/compliance/evidence", Organization: "/settings", User: "/settings",
  Finding: "/findings", ControlException: "/exceptions",
};
const VERBS: Record<string, string> = {
  CREATE: "created", UPDATE: "updated", DELETE: "deleted", APPROVE: "approved",
};
const MFA_PHRASES: Record<string, string> = {
  CREATE: "enabled MFA", DELETE: "disabled MFA", LOGIN: "signed in with MFA",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card py-5 text-card-foreground shadow-sm", className)}>
      <header className="flex items-start justify-between gap-3 px-5">
        <div className="grid gap-1">
          <h2 className="font-semibold leading-none">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="px-5">{children}</div>
    </section>
  );
}

function StatCard({
  label,
  value,
  footer,
  icon: Icon,
  href,
}: {
  label: string;
  value: ReactNode;
  footer: ReactNode;
  icon: typeof ShieldCheck;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="font-mono text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{footer}</div>
    </Link>
  );
}

function HealthBar({ label, good, warn, bad, href }: { label: string; good: number; warn: number; bad: number; href: string }) {
  const total = good + warn + bad;
  if (total === 0) return null;
  const gp = (good / total) * 100;
  const wp = (warn / total) * 100;
  return (
    <Link href={href} className="group block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium group-hover:underline">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{good}/{total} healthy</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {gp > 0 && <div className="bg-emerald-500" style={{ width: `${gp}%` }} />}
        {wp > 0 && <div className="bg-amber-400" style={{ width: `${wp}%` }} />}
        {100 - gp - wp > 0 && <div className="bg-red-400" style={{ width: `${100 - gp - wp}%` }} />}
      </div>
    </Link>
  );
}

// Server and browser format dates differently (locale, timezone), so render on the client only.
function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  return (
    <time dateTime={iso} title={d.toISOString().replace("T", " ").slice(0, 16) + " UTC"} suppressHydrationWarning>
      {formatDistanceToNow(d, { addSuffix: true })}
    </time>
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
  activityByDay,
}: {
  frameworks: Framework[];
  controls: Control[];
  risks: Risk[];
  policies: Policy[];
  evidence: Evidence[];
  findings: Finding[];
  exceptions: ExceptionSummary[];
  auditLogs: Log[];
  activityByDay: { day: string; count: number }[];
}) {
  const [frameworkId, setFrameworkId] = useState<string>("");
  const [days, setDays] = useState<number>(30);

  const selectedFramework = frameworks.find((f) => f.id === frameworkId) ?? null;

  const controlById = useMemo(() => {
    const m = new Map<string, Control>();
    for (const c of controls) m.set(c.id, c);
    return m;
  }, [controls]);

  const scopeIds = selectedFramework ? new Set(selectedFramework.citations.map((c) => c.controlId)) : null;

  const scopedCitations = selectedFramework
    ? selectedFramework.citations.map((c) => controlById.get(c.controlId)).filter((c): c is Control => !!c)
    : controls;
  const scopedRisks = scopeIds ? risks.filter((r) => r.controlIds.some((id) => scopeIds.has(id))) : risks;
  const scopedPolicies = scopeIds ? policies.filter((p) => p.controlIds.some((id) => scopeIds.has(id))) : policies;
  const scopedEvidence = scopeIds ? evidence.filter((e) => scopeIds.has(e.controlId)) : evidence;
  const scopedFindings = scopeIds ? findings.filter((f) => f.controlId && scopeIds.has(f.controlId)) : findings;

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
  const coveragePercent = applicableTotal > 0 ? Math.round((statusCounts.IMPLEMENTED / applicableTotal) * 100) : 0;

  const frameworkBars = frameworks.map((f) => {
    let implemented = 0;
    let applicable = 0;
    for (const cite of f.citations) {
      const c = controlById.get(cite.controlId);
      if (!c || c.status === "NOT_APPLICABLE") continue;
      applicable++;
      if (c.status === "IMPLEMENTED") implemented++;
    }
    return { label: f.name, value: implemented, total: applicable };
  });

  const evidenceHealth = useMemo(() => {
    const now = Date.now();
    let valid = 0, expiring = 0, expired = 0;
    for (const e of scopedEvidence) {
      if (e.status === "REJECTED") { expired++; continue; }
      if (e.validUntil) {
        const until = new Date(e.validUntil).getTime();
        if (until < now) { expired++; continue; }
        if ((until - now) / 86_400_000 <= 30) { expiring++; continue; }
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
    const now = Date.now();
    let approved = 0, pending = 0, expired = 0;
    for (const ex of exceptions) {
      if (ex.status === "APPROVED") {
        if (new Date(ex.validUntil).getTime() < now) expired++;
        else approved++;
      } else if (ex.status === "REQUESTED") pending++;
      else expired++;
    }
    return { good: approved, warn: pending, bad: expired };
  }, [exceptions]);

  const riskDistribution = useMemo(() => {
    const rows = RISK_LEVELS.map((level) => ({
      label: level[0].toUpperCase() + level.slice(1),
      inherent: 0,
      residual: 0,
    }));
    for (const r of scopedRisks) {
      const inherent = r.inherentScore || getRiskScore(r.likelihood, r.impact);
      rows[RISK_LEVELS.indexOf(getRiskLevel(inherent))].inherent++;
      if (r.residualScore > 0) rows[RISK_LEVELS.indexOf(getRiskLevel(r.residualScore))].residual++;
    }
    return rows;
  }, [scopedRisks]);

  // Buckets are UTC days from the database; fill gaps so the line doesn't skip empty days.
  const activitySeries = useMemo(() => {
    const counts = new Map(activityByDay.map((a) => [a.day, a.count]));
    const out: { label: string; value: number }[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      out.push({ label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, value: counts.get(key) ?? 0 });
    }
    return out;
  }, [activityByDay, days]);
  const activityTotal = activitySeries.reduce((n, p) => n + p.value, 0);

  const cutoff = Date.now() - days * 86_400_000;
  const scopedRiskIdSet = new Set(scopedRisks.map((r) => r.id));
  const scopedPolicyIdSet = new Set(scopedPolicies.map((p) => p.id));
  const scopedEvidenceIdSet = new Set(scopedEvidence.map((e) => e.id));

  const filteredLogs = auditLogs.filter((l) => {
    if (new Date(l.createdAt).getTime() < cutoff) return false;
    if (!scopeIds) return true;
    switch (l.entityType) {
      case "Control": return scopeIds.has(l.entityId);
      case "Risk": return scopedRiskIdSet.has(l.entityId);
      case "Policy": return scopedPolicyIdSet.has(l.entityId);
      case "Evidence": return scopedEvidenceIdSet.has(l.entityId);
      case "Framework": return l.entityId === selectedFramework!.id;
      default: return false;
    }
  });

  const topRisks = [...scopedRisks]
    .map((r) => ({ ...r, score: r.inherentScore || getRiskScore(r.likelihood, r.impact) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const openFindings = scopedFindings.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;
  const criticalFindings = scopedFindings.filter((f) => f.severity === "CRITICAL" && f.status !== "CLOSED").length;
  const scopeName = selectedFramework?.name ?? "All frameworks";

  return (
    <div className="anim-fade space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedFramework ? `${selectedFramework.name} posture` : "Governance, risk, and compliance posture"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Framework"
            value={frameworkId}
            onChange={(e) => setFrameworkId(e.target.value)}
            className="input h-9 w-auto"
          >
            <option value="">All frameworks</option>
            {frameworks.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <div role="radiogroup" aria-label="Time range" className="inline-flex h-9 items-center rounded-lg bg-muted p-[3px]">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.days}
                role="radio"
                aria-checked={days === tr.days}
                onClick={() => setDays(tr.days)}
                className={cn(
                  "h-full rounded-md px-3 text-sm font-medium transition-all",
                  days === tr.days ? "bg-background text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"
                )}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={selectedFramework ? "Requirements met" : "Controls implemented"}
          value={<>{statusCounts.IMPLEMENTED}<span className="text-lg text-muted-foreground">/{scopedCitations.length}</span></>}
          footer={`${coveragePercent}% of applicable controls`}
          icon={ShieldCheck}
          href="/compliance"
        />
        <StatCard
          label="Active risks"
          value={scopedRisks.length}
          footer={`${riskHealth.bad} open · ${riskHealth.warn} in treatment`}
          icon={AlertTriangle}
          href="/risks"
        />
        <StatCard
          label="Open findings"
          value={openFindings}
          footer={<span className={criticalFindings > 0 ? "font-medium text-red-600" : undefined}>{criticalFindings} critical</span>}
          icon={FileSearch}
          href="/findings"
        />
        <StatCard
          label="Evidence"
          value={scopedEvidence.length}
          footer={`${evidenceHealth.bad} expired · ${evidenceHealth.warn} expiring soon`}
          icon={FileCheck}
          href="/compliance/evidence"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Activity"
          description={<>{activityTotal} changes in the last {days} days · all frameworks</>}
        >
          <AreaTrendChart data={activitySeries} name="Changes" />
        </Panel>
        <Panel title="Control status" description={scopeName}>
          <DonutChart slices={donutSlices} centerLabel={`${coveragePercent}%`} centerSubLabel="implemented" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Risk distribution" description="Inherent vs residual, by level">
          <GroupedBarChart
            data={riskDistribution}
            series={[
              { key: "inherent", name: "Inherent", color: "var(--chart-1)" },
              { key: "residual", name: "Residual", color: "var(--chart-4)" },
            ]}
          />
        </Panel>
        <Panel
          title="Framework coverage"
          description="Implemented / applicable controls"
          action={
            <Link href="/compliance" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <HorizontalBarChart bars={frameworkBars} highlightLabel={selectedFramework?.name} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Program health" action={<Activity className="h-4 w-4 text-muted-foreground" />}>
          <div className="grid gap-5">
            <HealthBar label="Controls" good={statusCounts.IMPLEMENTED} warn={statusCounts.IN_PROGRESS} bad={statusCounts.NOT_STARTED} href="/compliance" />
            <HealthBar label="Evidence" {...evidenceHealth} href="/compliance/evidence" />
            <HealthBar label="Risks" {...riskHealth} href="/risks" />
            <HealthBar label="Findings" {...findingHealth} href="/findings" />
            <HealthBar label="Exceptions" {...exceptionHealth} href="/exceptions" />
          </div>
        </Panel>

        <Panel title="Top risks" description={selectedFramework ? `Linked to ${selectedFramework.name}` : "Highest inherent score"}>
          <ul className="grid gap-2">
            {topRisks.map((risk) => {
              const level = getRiskLevel(risk.score);
              return (
                <li key={risk.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{risk.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {risk.ownerName ?? "Unassigned"}
                      {risk.residualScore > 0 && <> · residual {risk.residualScore}</>}
                    </p>
                  </div>
                  <span className={`badge shrink-0 font-mono ${getRiskColor(level)}`}>
                    {risk.score} {level}
                  </span>
                </li>
              );
            })}
            {topRisks.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No risks {selectedFramework ? "linked to this framework" : "registered"} yet.
              </p>
            )}
          </ul>
        </Panel>

        <Panel title="Recent activity" description={`Last ${days} days`}>
          <ul className="-my-1">
            {filteredLogs.slice(0, 8).map((log) => {
              const href = HREFS[log.entityType];
              const entity = log.entityType.toLowerCase().replace("controlexception", "exception");
              return (
                <li key={log.id} className="flex gap-3 py-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="leading-snug">
                      <span className="font-medium">{log.userName || "(deleted user)"}</span>{" "}
                      <span className="text-muted-foreground">
                        {log.entityType === "MFA"
                          ? MFA_PHRASES[log.action] ?? "updated MFA"
                          : `${VERBS[log.action] ?? "acted on"} ${ARTICLES[log.entityType] ?? "a"} ${entity}`}
                      </span>
                      {log.entityName && (
                        <>
                          {" "}
                          {href && log.action !== "DELETE" ? (
                            <Link href={href} className="font-medium hover:underline">
                              {log.entityName}
                            </Link>
                          ) : (
                            <span className="font-medium">{log.entityName}</span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <RelativeTime iso={log.createdAt} />
                    </p>
                  </div>
                </li>
              );
            })}
            {filteredLogs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity in the last {days} days{selectedFramework ? ` for ${selectedFramework.name}` : ""}.
              </p>
            )}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
