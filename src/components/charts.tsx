"use client";

// Hand-rolled SVG charts. Zero dependencies. Both are pure, deterministic given the same input,
// and render fine server-side if the caller happens to use them in an RSC.

export type DonutSlice = {
  label: string;
  value: number;
  color: string; // any valid CSS color
};

export function DonutChart({
  slices,
  size = 180,
  thickness = 24,
  centerLabel,
  centerSubLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  return (
    <div className="inline-flex flex-col items-center gap-3">
      <svg width={size} height={size} role="img" aria-label="Control status distribution">
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgb(243 244 246)"
          strokeWidth={thickness}
        />

        {total > 0 &&
          slices.map((s) => {
            if (s.value === 0) return null;
            const length = (s.value / total) * circumference;
            const dasharray = `${length} ${circumference - length}`;
            const el = (
              <circle
                key={s.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dasharray}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="butt"
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += length;
            return el;
          })}

        {/* Center text */}
        {centerLabel && (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-gray-900"
            style={{ fontSize: 22, fontWeight: 600 }}
          >
            {centerLabel}
          </text>
        )}
        {centerSubLabel && (
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-gray-500"
            style={{ fontSize: 10 }}
          >
            {centerSubLabel}
          </text>
        )}
      </svg>

      {/* Legend */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-gray-700">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1">{s.label}</span>
            <span className="tabular-nums text-gray-500">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type HorizontalBar = {
  label: string;
  value: number; // implemented count
  total: number; // total controls in this framework
  href?: string;
};

export function HorizontalBarChart({
  bars,
  highlightLabel,
}: {
  bars: HorizontalBar[];
  highlightLabel?: string;
}) {
  return (
    <ul className="space-y-2.5">
      {bars.map((b) => {
        const pct = b.total > 0 ? Math.round((b.value / b.total) * 100) : 0;
        const isHi = highlightLabel && b.label === highlightLabel;
        return (
          <li key={b.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span
                className={
                  isHi ? "font-medium text-brand-700" : "font-medium text-gray-700"
                }
              >
                {b.label}
              </span>
              <span className="tabular-nums text-gray-500">
                {b.value}/{b.total} ({pct}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className={
                  isHi
                    ? "h-2 rounded-full bg-brand-600 transition-all"
                    : "h-2 rounded-full bg-brand-400 transition-all"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
