"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

type TooltipEntry = { name?: string; value?: number | string; color?: string; payload?: { fill?: string } };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[8rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label && <div className="mb-1 font-semibold">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="flex-1 text-muted-foreground">{p.name}</span>
          <span className="font-mono font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

export function DonutChart({
  slices,
  centerLabel,
  centerSubLabel,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerSubLabel?: string;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const data = total > 0 ? slices.filter((s) => s.value > 0) : [{ label: "None", value: 1, color: "var(--muted)" }];

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={total > 0 && data.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            {total > 0 && <Tooltip content={<ChartTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-2xl font-bold tabular-nums text-foreground">{centerLabel}</span>
            {centerSubLabel && <span className="text-[11px] text-muted-foreground">{centerSubLabel}</span>}
          </div>
        )}
      </div>
      <ul className="grid w-full max-w-[14rem] gap-2 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-mono font-semibold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AreaTrendChart({
  data,
  name,
  height = 220,
}: {
  data: { label: string; value: number }[];
  name: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={false}
          activeDot={{ r: 4, fill: "var(--background)", stroke: "var(--chart-1)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({
  data,
  series,
  height = 220,
}: {
  data: ({ label: string } & Record<string, string | number>)[];
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
        <Legend
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)", paddingTop: 8 }}
        />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={32} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export type HorizontalBar = { label: string; value: number; total: number };

export function HorizontalBarChart({
  bars,
  highlightLabel,
}: {
  bars: HorizontalBar[];
  highlightLabel?: string;
}) {
  return (
    <ul className="space-y-3">
      {bars.map((b) => {
        const pct = b.total > 0 ? Math.round((b.value / b.total) * 100) : 0;
        const isHi = highlightLabel === b.label;
        return (
          <li key={b.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className={cn("truncate font-medium", isHi ? "text-foreground" : "text-muted-foreground")}>
                {b.label}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {b.value}/{b.total} · {pct}%
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={b.label}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn("h-full rounded-full transition-all", isHi ? "bg-primary" : "bg-primary/70")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
