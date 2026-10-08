import { cn } from "@/lib/utils";

// Original badge artwork. Official framework logos (AICPA, ISO, PCI SSC) are trademarked
// and restricted, and the laws (GDPR, DPDP, HIPAA) have none, so we draw our own marks.

type Badge = {
  top?: string;
  main: string;
  bg: string;
  fg: string;
  decor?: "eu-stars" | "india-stripes";
};

const BADGES: { match: RegExp; badge: Badge }[] = [
  { match: /soc\s*2/i, badge: { main: "SOC 2", bg: "#4338ca", fg: "#ffffff" } },
  { match: /27001/, badge: { top: "ISO", main: "27001", bg: "#1e3a8a", fg: "#ffffff" } },
  { match: /27701/, badge: { top: "ISO", main: "27701", bg: "#6d28d9", fg: "#ffffff" } },
  { match: /hipaa/i, badge: { top: "US", main: "HIPAA", bg: "#0f766e", fg: "#ffffff" } },
  { match: /pci/i, badge: { top: "PCI", main: "DSS", bg: "#c2410c", fg: "#ffffff" } },
  { match: /gdpr/i, badge: { main: "GDPR", bg: "#003399", fg: "#ffffff", decor: "eu-stars" } },
  { match: /nist/i, badge: { top: "NIST", main: "CSF", bg: "#334155", fg: "#ffffff" } },
  { match: /dpdp/i, badge: { top: "INDIA", main: "DPDP", bg: "#ffffff", fg: "#000080", decor: "india-stripes" } },
];

function badgeFor(name: string, fallbackColor?: string): Badge {
  const hit = BADGES.find((b) => b.match.test(name));
  if (hit) return hit.badge;
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return fallbackColor
    ? { main: initials || "?", bg: fallbackColor, fg: "#ffffff" }
    : { main: initials || "?", bg: "var(--muted)", fg: "var(--foreground)" };
}

// EU-flag star ring; rounded because server and browser trig differ in the last digits (hydration).
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  return { cx: Math.round((24 + Math.cos(a) * 17) * 100) / 100, cy: Math.round((24 + Math.sin(a) * 17) * 100) / 100 };
});

function EuStars() {
  return (
    <g fill="#FFCC00">
      {EU_STARS.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={1.5} />
      ))}
    </g>
  );
}

export function FrameworkBadge({
  name,
  size = 44,
  fallbackColor,
  className,
}: {
  name: string;
  size?: number;
  fallbackColor?: string;
  className?: string;
}) {
  const b = badgeFor(name, fallbackColor);
  const mainSize = b.decor === "eu-stars" ? 10 : b.main.length >= 5 ? 10.5 : b.main.length === 4 ? 12 : 13;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${name} badge`}
      className={cn("shrink-0 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10", className)}
    >
      <rect width="48" height="48" rx="10" fill={b.bg} />
      {b.decor === "india-stripes" && (
        <>
          <rect width="48" height="9" fill="#FF9933" />
          <rect y="39" width="48" height="9" fill="#138808" />
          <circle cx="24" cy="24" r="12.5" fill="none" stroke="#000080" strokeOpacity="0.15" strokeWidth="1" />
        </>
      )}
      {b.decor === "eu-stars" && <EuStars />}
      {b.top && (
        <text
          x="24"
          y={b.decor === "india-stripes" ? 20 : 19}
          textAnchor="middle"
          fill={b.fg}
          fillOpacity={0.75}
          fontSize="6.5"
          fontWeight="700"
          letterSpacing="0.6"
          fontFamily="var(--text-family), system-ui, sans-serif"
        >
          {b.top}
        </text>
      )}
      <text
        x="24"
        y={b.top ? 31 : 28.5}
        textAnchor="middle"
        fill={b.fg}
        fontSize={mainSize}
        fontWeight="800"
        letterSpacing="-0.2"
        fontFamily="var(--text-family), system-ui, sans-serif"
      >
        {b.main}
      </text>
    </svg>
  );
}
