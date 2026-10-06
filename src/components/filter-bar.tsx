"use client";

import { ReactNode } from "react";
import { Search } from "lucide-react";

export type SelectOption = { value: string; label: string };

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  selects = [],
  right,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  selects?: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
  }[];
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="input pl-9"
        />
      </div>
      {selects.map((s) => (
        <select
          key={s.label}
          value={s.value}
          onChange={(e) => s.onChange(e.target.value)}
          aria-label={s.label}
          className="input w-auto"
        >
          <option value="">{s.label}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function useFilterState<T extends Record<string, string>>(initial: T) {
  return initial; // placeholder for future url-sync helper
}
