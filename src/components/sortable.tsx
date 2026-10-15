"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
type SortValue = string | number | Date | null | undefined;

const toComparable = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === "string" ? v.toLowerCase() : v);

/**
 * Client-side sorting for a table. `accessors` maps a column key to the value it sorts by.
 * Empty values always go last, whichever direction is chosen.
 */
export function useSort<T>(rows: T[], accessors: Record<string, (row: T) => SortValue>, initial: SortState = null) {
  const [sort, setSort] = useState<SortState>(initial);
  const sorted = useMemo(() => {
    const get = sort && accessors[sort.key];
    if (!sort || !get) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i, v: toComparable(get(row)) }))
      .sort((a, b) => {
        const aEmpty = a.v === null || a.v === undefined || a.v === "";
        const bEmpty = b.v === null || b.v === undefined || b.v === "";
        if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.i - b.i : aEmpty ? 1 : -1;
        if (typeof a.v === "string" && typeof b.v === "string") {
          return factor * a.v.localeCompare(b.v, undefined, { numeric: true }) || a.i - b.i;
        }
        return factor * ((a.v as number) - (b.v as number)) || a.i - b.i;
      })
      .map((x) => x.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  return { sorted, sort, setSort };
}

/** Ranks enum values in a meaningful order (e.g. severity) instead of alphabetically. */
export const rank = (order: readonly string[]) => (v: string | null | undefined) => {
  if (!v) return null;
  const i = order.indexOf(v);
  return i === -1 ? order.length : i;
};

/**
 * Clickable column header: clicking opens a small menu to sort ascending, descending or clear.
 * Renders a <th>; pass the table's usual header classes via className.
 */
export function SortHeader({
  label, sortKey, sort, onSort, className = "", align = "left", ascLabel = "Ascending", descLabel = "Descending",
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (s: SortState) => void;
  className?: string;
  align?: "left" | "center" | "right";
  ascLabel?: string;
  descLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = sort?.key === sortKey ? sort.dir : null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const choose = (s: SortState) => { onSort(s); setOpen(false); };
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-normal text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800";

  return (
    <th className={className} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
      <div ref={ref} className={`relative inline-flex ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 ${active ? "text-gray-900 dark:text-gray-100" : ""}`}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
        </button>
        {open && (
          <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-40 rounded-md border border-border bg-white p-1 shadow-lg dark:bg-gray-900">
            <button role="menuitem" type="button" className={item} onClick={() => choose({ key: sortKey, dir: "asc" })}>
              <ArrowUp className="h-3.5 w-3.5" /> {ascLabel}
            </button>
            <button role="menuitem" type="button" className={item} onClick={() => choose({ key: sortKey, dir: "desc" })}>
              <ArrowDown className="h-3.5 w-3.5" /> {descLabel}
            </button>
            {active && (
              <button role="menuitem" type="button" className={item} onClick={() => choose(null)}>
                <X className="h-3.5 w-3.5" /> Clear sort
              </button>
            )}
          </div>
        )}
      </div>
    </th>
  );
}

/** "Sort by" dropdown for lists shown as cards rather than a table. */
export function SortSelect({
  options, sort, onSort, className = "",
}: {
  options: { key: string; label: string; asc?: string; desc?: string }[];
  sort: SortState;
  onSort: (s: SortState) => void;
  className?: string;
}) {
  const value = sort ? `${sort.key}:${sort.dir}` : "";
  return (
    <select
      value={value}
      onChange={(e) => {
        const [key, dir] = e.target.value.split(":");
        onSort(key ? { key, dir: dir as SortDir } : null);
      }}
      aria-label="Sort by"
      className={`input w-auto py-1.5 text-sm ${className}`}
    >
      <option value="">Sort: default</option>
      {options.flatMap((o) => [
        <option key={`${o.key}:asc`} value={`${o.key}:asc`}>{o.label}: {o.asc ?? "A → Z"}</option>,
        <option key={`${o.key}:desc`} value={`${o.key}:desc`}>{o.label}: {o.desc ?? "Z → A"}</option>,
      ])}
    </select>
  );
}
