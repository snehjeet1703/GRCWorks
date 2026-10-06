"use client";

import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";
import { getRiskLevel, getRiskColor, getPolicyStatusColor, getControlStatusColor } from "@/lib/utils";

type Evidence = {
  id: string;
  fileName: string;
  fileSize: number;
  notes: string;
  createdAt: string;
  uploadedByName: string;
};
type RiskLink = {
  id: string;
  title: string;
  score: number;
  treatment: string;
};
type PolicyLink = {
  id: string;
  title: string;
  status: string;
  version: number;
  approvedAt: string | null;
};
type ControlReportRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  status: string;
  frequency: string;
  updatedAt: string;
  evidence: Evidence[];
  risks: RiskLink[];
  policies: PolicyLink[];
  alsoSatisfies: { name: string; code: string }[];
};
type Risk = {
  id: string;
  title: string;
  category: string;
  likelihood: number;
  impact: number;
  treatment: string;
  treatmentPlan: string;
  ownerName: string | null;
};
type Policy = {
  id: string;
  title: string;
  status: string;
  version: number;
  approverName: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
};
type Log = {
  id: string;
  createdAt: string;
  userName: string;
  action: string;
  entityType: string;
  entityName: string;
};

function humanStatus(s: string) {
  return s.toLowerCase().replaceAll("_", " ");
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ReportView({
  organization,
  framework,
  controls,
  risks,
  policies,
  auditLogs,
  generatedAt,
  generatedByName,
  backHref,
}: {
  organization: { name: string; slug: string };
  framework: { id: string; name: string; version: string; description: string };
  controls: ControlReportRow[];
  risks: Risk[];
  policies: Policy[];
  auditLogs: Log[];
  generatedAt: string;
  generatedByName: string;
  backHref: string;
}) {
  const total = controls.length;
  const byStatus = controls.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});
  const implemented = byStatus["IMPLEMENTED"] ?? 0;
  const inProgress = byStatus["IN_PROGRESS"] ?? 0;
  const notStarted = byStatus["NOT_STARTED"] ?? 0;
  const notApplicable = byStatus["NOT_APPLICABLE"] ?? 0;
  const applicable = total - notApplicable;
  const percent = applicable > 0 ? Math.round((implemented / applicable) * 100) : 0;
  const totalEvidence = controls.reduce((n, c) => n + c.evidence.length, 0);

  return (
    <div className="report">
      {/* Print-only + on-screen styles */}
      <style jsx global>{`
        @page {
          size: A4;
          margin: 18mm 14mm 20mm 14mm;
        }
        @media print {
          aside, .no-print { display: none !important; }
          main { padding: 0 !important; }
          main > div { max-width: none !important; padding: 0 !important; }
          .report { color: #111827; }
          .report .page-break { break-before: page; }
          .report h1, .report h2, .report h3 { break-after: avoid; }
          .report table { break-inside: auto; }
          .report tr, .report .control-block { break-inside: avoid; }
          a { color: inherit; text-decoration: none; }
        }
        .report { font-size: 12px; line-height: 1.45; color: #111827; }
        .report h1 { font-size: 22px; font-weight: 600; }
        .report h2 { font-size: 16px; font-weight: 600; margin-top: 24px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; }
        .report h3 { font-size: 13px; font-weight: 600; }
        .report .stat { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
        .report .stat-num { font-size: 20px; font-weight: 600; }
        .report .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
        .report .control-block { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px; margin-bottom: 8px; }
        .report .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; border: 1px solid transparent; }
        .report .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      `}</style>

      {/* Action bar — hidden in print */}
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to framework
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary"
        >
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </button>
      </div>

      {/* Cover */}
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500">
          Compliance report
        </p>
        <h1 className="mt-1">{framework.name}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Version {framework.version} · {organization.name}
        </p>
        {framework.description && (
          <p className="mt-3 max-w-3xl text-sm text-gray-700">{framework.description}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-gray-500">
          <span>
            Generated by <span className="text-gray-900">{generatedByName}</span>
          </span>
          <span>
            on <span className="text-gray-900">{new Date(generatedAt).toLocaleString()}</span>
          </span>
        </div>
      </div>

      {/* Executive summary */}
      <h2>Executive summary</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="stat">
          <p className="stat-label">Coverage</p>
          <p className="stat-num">{percent}%</p>
          <p className="text-xs text-gray-500">
            {implemented} of {applicable} applicable controls implemented
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">In progress</p>
          <p className="stat-num">{inProgress}</p>
          <p className="text-xs text-gray-500">controls actively being worked</p>
        </div>
        <div className="stat">
          <p className="stat-label">Not started</p>
          <p className="stat-num">{notStarted}</p>
          <p className="text-xs text-gray-500">
            {notApplicable > 0
              ? `plus ${notApplicable} marked not applicable`
              : "controls with no work started"}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Evidence collected</p>
          <p className="stat-num">{totalEvidence}</p>
          <p className="text-xs text-gray-500">artifacts across all controls</p>
        </div>
      </div>

      {/* Control matrix */}
      <h2>Control matrix</h2>
      <p className="text-xs text-gray-500 mb-3">
        One row per control. "Also satisfies" lists other frameworks the same underlying implementation counts for.
      </p>
      <div>
        {controls.map((c) => {
          const statusColor = getControlStatusColor(c.status);
          return (
            <div key={c.id} className="control-block">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="mono text-gray-600">{c.code}</span>{" "}
                    <span className="font-medium text-gray-900">{c.title}</span>
                  </p>
                  {c.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{c.description}</p>
                  )}
                </div>
                <span className={`tag ${statusColor}`}>{humanStatus(c.status)}</span>
              </div>

              {c.alsoSatisfies.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    Also satisfies
                  </span>
                  {c.alsoSatisfies.map((f) => (
                    <span
                      key={f.name + f.code}
                      className="tag text-emerald-800 bg-emerald-50 border-emerald-200"
                    >
                      {f.name.replace(" Security Rule", "").replace(" Type II", "")}{" "}
                      <span className="mono">{f.code}</span>
                    </span>
                  ))}
                </div>
              )}

              {c.evidence.length > 0 && (
                <div className="mt-3">
                  <h3>Evidence ({c.evidence.length})</h3>
                  <ul className="mt-1 space-y-0.5">
                    {c.evidence.map((e) => (
                      <li key={e.id} className="text-xs text-gray-700">
                        <span className="mono">{e.fileName}</span>{" "}
                        <span className="text-gray-500">
                          — {formatBytes(e.fileSize)}, uploaded {new Date(e.createdAt).toLocaleDateString()} by {e.uploadedByName}
                        </span>
                        {e.notes && (
                          <p className="ml-2 text-[11px] text-gray-500">{e.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.risks.length > 0 && (
                <div className="mt-3">
                  <h3>Linked risks</h3>
                  <ul className="mt-1 space-y-0.5">
                    {c.risks.map((r) => {
                      const level = getRiskLevel(r.score);
                      return (
                        <li key={r.id} className="text-xs text-gray-700">
                          {r.title}{" "}
                          <span className={`tag ${getRiskColor(level)}`}>
                            {r.score} {level}
                          </span>{" "}
                          <span className="text-gray-500 capitalize">
                            · {r.treatment.toLowerCase()}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {c.policies.length > 0 && (
                <div className="mt-3">
                  <h3>Linked policies</h3>
                  <ul className="mt-1 space-y-0.5">
                    {c.policies.map((p) => (
                      <li key={p.id} className="text-xs text-gray-700">
                        {p.title} (v{p.version}){" "}
                        <span className={`tag ${getPolicyStatusColor(p.status)}`}>
                          {humanStatus(p.status)}
                        </span>
                        {p.approvedAt && (
                          <span className="text-gray-500">
                            {" "}
                            · approved {new Date(p.approvedAt).toLocaleDateString()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {c.evidence.length === 0 && c.risks.length === 0 && c.policies.length === 0 && (
                <p className="mt-2 text-xs italic text-gray-400">
                  No evidence, linked risks, or linked policies yet.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Risk register appendix */}
      <div className="page-break" />
      <h2>Risk register (mapped to this framework)</h2>
      {risks.length === 0 ? (
        <p className="text-xs italic text-gray-400">No risks linked to any control in this framework.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1.5 text-left">Risk</th>
              <th className="py-1.5 text-left">Category</th>
              <th className="py-1.5 text-center">L</th>
              <th className="py-1.5 text-center">I</th>
              <th className="py-1.5 text-center">Score</th>
              <th className="py-1.5 text-left">Treatment</th>
              <th className="py-1.5 text-left">Owner</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => {
              const score = r.likelihood * r.impact;
              const level = getRiskLevel(score);
              return (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-1.5">{r.title}</td>
                  <td className="py-1.5 text-gray-500">{r.category || "—"}</td>
                  <td className="py-1.5 text-center">{r.likelihood}</td>
                  <td className="py-1.5 text-center">{r.impact}</td>
                  <td className="py-1.5 text-center">
                    <span className={`tag ${getRiskColor(level)}`}>{score} {level}</span>
                  </td>
                  <td className="py-1.5 capitalize">{r.treatment.toLowerCase()}</td>
                  <td className="py-1.5 text-gray-500">{r.ownerName ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Policy appendix */}
      <div className="page-break" />
      <h2>Policies (mapped to this framework)</h2>
      {policies.length === 0 ? (
        <p className="text-xs italic text-gray-400">No policies linked to any control in this framework.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1.5 text-left">Policy</th>
              <th className="py-1.5 text-left">Status</th>
              <th className="py-1.5 text-left">Version</th>
              <th className="py-1.5 text-left">Approver</th>
              <th className="py-1.5 text-left">Approved</th>
              <th className="py-1.5 text-left">Expires</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-1.5">{p.title}</td>
                <td className="py-1.5">
                  <span className={`tag ${getPolicyStatusColor(p.status)}`}>
                    {humanStatus(p.status)}
                  </span>
                </td>
                <td className="py-1.5">v{p.version}</td>
                <td className="py-1.5 text-gray-500">{p.approverName ?? "—"}</td>
                <td className="py-1.5 text-gray-500">
                  {p.approvedAt ? new Date(p.approvedAt).toLocaleDateString() : "—"}
                </td>
                <td className="py-1.5 text-gray-500">
                  {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Audit log appendix */}
      <div className="page-break" />
      <h2>Recent activity (last 30 days)</h2>
      {auditLogs.length === 0 ? (
        <p className="text-xs italic text-gray-400">No activity recorded in the past 30 days.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-1.5 text-left">When</th>
              <th className="py-1.5 text-left">Who</th>
              <th className="py-1.5 text-left">Action</th>
              <th className="py-1.5 text-left">Entity</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((l) => (
              <tr key={l.id} className="border-b border-gray-100">
                <td className="py-1.5 text-gray-500 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="py-1.5">{l.userName || "(deleted user)"}</td>
                <td className="py-1.5 capitalize">{l.action.toLowerCase()}</td>
                <td className="py-1.5">
                  <span className="text-gray-500">{l.entityType}</span>
                  {l.entityName && <> · {l.entityName}</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-10 text-center text-[10px] text-gray-400">
        Generated by GRC Platform · {organization.name} · {new Date(generatedAt).toISOString()}
      </div>
    </div>
  );
}
