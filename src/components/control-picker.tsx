"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type PickerControl = {
  id: string;
  code: string;
  title: string;
  frameworkNames: string[];
};

export function ControlPicker({
  allControls,
  selectedIds,
  onChange,
}: {
  allControls: PickerControl[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allControls;
    return allControls.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.frameworkNames.some((f) => f.toLowerCase().includes(q))
    );
  }, [query, allControls]);

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  const selectedControls = allControls.filter((c) => selectedSet.has(c.id));

  return (
    <div className="space-y-2">
      {selectedControls.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-lg border border-gray-100 bg-gray-50 p-2">
          {selectedControls.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700"
            >
              <span className="font-mono">{c.code}</span>
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="text-gray-400 hover:text-red-600"
                aria-label={`Remove ${c.code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search controls by code, title, or framework…"
          className="input pl-9"
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">No controls match.</p>
        ) : (
          filtered.slice(0, 100).map((c) => {
            const checked = selectedSet.has(c.id);
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-mono text-xs text-gray-600">{c.code}</span>{" "}
                    {c.title}
                  </p>
                  {c.frameworkNames.length > 0 && (
                    <p className="text-xs text-gray-400">
                      {c.frameworkNames.join(" · ")}
                    </p>
                  )}
                </div>
              </label>
            );
          })
        )}
        {filtered.length > 100 && (
          <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400">
            Showing 100 of {filtered.length}. Refine your search.
          </p>
        )}
      </div>
    </div>
  );
}
