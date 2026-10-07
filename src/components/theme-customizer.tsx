"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Ban, Check, Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_COOKIE,
  ThemeConfig,
  themeHtmlAttributes,
} from "@/lib/theme-config";

function applyTheme(t: ThemeConfig) {
  const root = document.documentElement;
  const attrs = themeHtmlAttributes(t);
  root.classList.toggle("dark", t.mode === "dark");
  for (const key of ["data-theme-preset", "data-theme-radius", "data-theme-scale"] as const) {
    const value = attrs[key];
    if (value) root.setAttribute(key, value);
    else root.removeAttribute(key);
  }
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(JSON.stringify(t))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

function readTheme(): ThemeConfig {
  const root = document.documentElement;
  return {
    preset: root.getAttribute("data-theme-preset") ?? DEFAULT_THEME.preset,
    radius: root.getAttribute("data-theme-radius") ?? DEFAULT_THEME.radius,
    scale: root.getAttribute("data-theme-scale") ?? DEFAULT_THEME.scale,
    mode: root.classList.contains("dark") ? "dark" : "light",
  };
}

function ToggleRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium leading-none">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex w-full">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-8 grow items-center justify-center gap-1.5 border border-input px-2 text-xs font-medium shadow-sm transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
              i === 0 ? "rounded-l-md" : "-ml-px",
              i === options.length - 1 && "rounded-r-md",
              value === o.value
                ? "relative z-10 bg-accent text-accent-foreground"
                : "bg-background hover:bg-accent/60"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeCustomizer({
  sidebarOpen,
  onSidebarChange,
}: {
  sidebarOpen: boolean;
  onSidebarChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setTheme(readTheme()), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const latest = useRef(theme);
  latest.current = theme;

  const update = (patch: Partial<ThemeConfig>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setTheme(next);
    applyTheme(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Customize theme"
        aria-expanded={open}
        title="Customize theme"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
      >
        <Palette className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Theme settings"
          className="anim-pop absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        >
          <div className="grid gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium leading-none">Theme preset</span>
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.map((t) => {
                  const active = theme.preset === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update({ ...DEFAULT_THEME, mode: latest.current.mode, preset: t.value })}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-md border px-2 text-left text-xs transition-colors",
                        active ? "border-ring bg-accent font-medium" : "border-input hover:bg-accent/60"
                      )}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="truncate">{t.name}</span>
                      {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <ToggleRow
              label="Scale"
              value={theme.scale}
              onChange={(scale) => update({ scale })}
              options={[
                { value: "none", label: <Ban />, title: "Default" },
                { value: "sm", label: "XS" },
                { value: "lg", label: "LG" },
              ]}
            />

            <ToggleRow
              label="Radius"
              value={theme.radius === "default" ? "" : theme.radius}
              onChange={(radius) => update({ radius })}
              options={[
                { value: "none", label: <Ban />, title: "Square corners" },
                { value: "sm", label: "SM" },
                { value: "md", label: "MD" },
                { value: "lg", label: "LG" },
                { value: "xl", label: "XL" },
              ]}
            />

            <ToggleRow
              label="Color mode"
              value={theme.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: "light", label: <><Sun /> Light</> },
                { value: "dark", label: <><Moon /> Dark</> },
              ]}
            />

            <div className="hidden md:block">
              <ToggleRow
                label="Sidebar mode"
                value={sidebarOpen ? "full" : "icon"}
                onChange={(v) => onSidebarChange(v === "full")}
                options={[
                  { value: "full", label: "Default" },
                  { value: "icon", label: "Icon" },
                ]}
              />
            </div>
          </div>

          <button type="button" onClick={() => update(DEFAULT_THEME)} className="btn-primary mt-4 w-full">
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
