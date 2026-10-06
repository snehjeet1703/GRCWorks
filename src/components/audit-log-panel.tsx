"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { History, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

type AuditEntry = {
  id: string;
  createdAt: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  changes: Record<string, unknown>;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  APPROVE: "Approved",
  CLOSE: "Closed",
  REJECT: "Rejected",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  APPROVE: "bg-emerald-100 text-emerald-700",
  CLOSE: "bg-gray-100 text-gray-700",
  REJECT: "bg-orange-100 text-orange-700",
};

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/Id$/, "")
    .replace(/At$/, " at")
    .trim();
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "string") {
    const d = Date.parse(val);
    if (!isNaN(d) && val.includes("T")) return new Date(val).toLocaleString();
    return val;
  }
  if (typeof val === "number") return String(val);
  return JSON.stringify(val);
}

function ChangesDetail({ entry }: { entry: AuditEntry }) {
  const before = entry.beforeJson;
  const after = entry.afterJson;
  const changes = entry.changes;

  if (before && after) {
    const keys = Object.keys(after).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
    );
    if (keys.length === 0)
      return <p className="text-xs text-gray-400 italic">No field changes</p>;
    return (
      <div className="space-y-1.5">
        {keys.map((key) => (
          <div key={key} className="text-xs">
            <span className="font-medium text-gray-600">
              {formatFieldName(key)}:
            </span>{" "}
            <span className="text-red-500 line-through">
              {formatValue(before[key])}
            </span>{" "}
            <span className="text-gray-400">&rarr;</span>{" "}
            <span className="text-green-600">{formatValue(after[key])}</span>
          </div>
        ))}
      </div>
    );
  }

  if (changes && typeof changes === "object" && Object.keys(changes).length > 0) {
    return (
      <div className="space-y-1">
        {Object.entries(changes).map(([key, val]) => (
          <div key={key} className="text-xs">
            <span className="font-medium text-gray-600">
              {formatFieldName(key)}:
            </span>{" "}
            <span className="text-gray-800">{formatValue(val)}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export function AuditLogPanel({
  entityTypes,
  title = "Audit Log",
  limit = 50,
}: {
  entityTypes: string[];
  title?: string;
  limit?: number;
}) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      entityTypes.forEach((t) => params.append("entityType", t));
      params.set("limit", String(limit));
      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) setLogs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [entityTypes, limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-base font-medium text-gray-900 hover:text-brand-700"
        >
          <History className="h-4 w-4 text-gray-500" />
          {title}
          <span className="text-xs font-normal text-gray-400">
            ({logs.length} entries)
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <>
          {loading && logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Loading audit log...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              No audit entries yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="pb-2 pr-3 w-8"></th>
                    <th className="pb-2 pr-3">When</th>
                    <th className="pb-2 pr-3">User</th>
                    <th className="pb-2 pr-3">Action</th>
                    <th className="pb-2 pr-3">Entity</th>
                    <th className="pb-2">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isOpen = expandedRows.has(log.id);
                    const hasDetails =
                      (log.beforeJson && log.afterJson) ||
                      (log.changes &&
                        typeof log.changes === "object" &&
                        Object.keys(log.changes).length > 0);
                    return (
                      <Fragment key={log.id}>
                        <tr className="border-b border-gray-50 group">
                          <td className="py-2 pr-1">
                            {hasDetails && (
                              <button
                                onClick={() => toggleRow(log.id)}
                                className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                              >
                                {isOpen ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2 pr-3 font-medium text-gray-700 whitespace-nowrap">
                            {log.userName || "(deleted user)"}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                                ACTION_COLORS[log.action] ??
                                "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {ACTION_LABELS[log.action] ?? log.action}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                            {log.entityType
                              .replace("ControlException", "Exception")
                              .replace("RiskAction", "Risk Action")}
                          </td>
                          <td className="py-2 text-gray-700 truncate max-w-[200px]">
                            {log.entityName || "—"}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={6} className="pb-3 pt-1 px-2">
                              <div className="ml-6 p-3 rounded-lg bg-gray-50 border border-gray-100">
                                <p className="text-xs font-medium text-gray-500 mb-2">
                                  Changes
                                </p>
                                <ChangesDetail entry={log} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
