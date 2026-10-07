export const THEME_COOKIE = "theme_config";

export type ThemeConfig = {
  preset: string;
  radius: string;
  scale: string;
  mode: "light" | "dark";
};

export const DEFAULT_THEME: ThemeConfig = {
  preset: "default",
  radius: "default",
  scale: "none",
  mode: "light",
};

export const THEMES = [
  { name: "Default", value: "default", color: "oklch(0.33 0 0)" },
  { name: "Underground", value: "underground", color: "oklch(0.5315 0.0694 156.19)" },
  { name: "Rose Garden", value: "rose-garden", color: "oklch(0.5827 0.2418 12.23)" },
  { name: "Lake View", value: "lake-view", color: "oklch(0.765 0.177 163.22)" },
  { name: "Sunset Glow", value: "sunset-glow", color: "oklch(0.5827 0.2187 36.98)" },
  { name: "Forest Whisper", value: "forest-whisper", color: "oklch(0.5276 0.1072 182.22)" },
  { name: "Ocean Breeze", value: "ocean-breeze", color: "oklch(0.59 0.20 277.12)" },
  { name: "Lavender Dream", value: "lavender-dream", color: "oklch(0.71 0.16 293.54)" },
];

const RADII = ["default", "none", "sm", "md", "lg", "xl"];
const SCALES = ["none", "sm", "lg"];

// Cookie values are user-controlled, so only accept known values.
export function parseThemeCookie(raw: string | undefined): ThemeConfig {
  if (!raw) return DEFAULT_THEME;
  try {
    const t = JSON.parse(decodeURIComponent(raw));
    return {
      preset: THEMES.some((p) => p.value === t.preset) ? t.preset : DEFAULT_THEME.preset,
      radius: RADII.includes(t.radius) ? t.radius : DEFAULT_THEME.radius,
      scale: SCALES.includes(t.scale) ? t.scale : DEFAULT_THEME.scale,
      mode: t.mode === "dark" ? "dark" : "light",
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function themeHtmlAttributes(t: ThemeConfig) {
  return {
    className: t.mode === "dark" ? "dark" : undefined,
    "data-theme-preset": t.preset !== "default" ? t.preset : undefined,
    "data-theme-radius": t.radius !== "default" ? t.radius : undefined,
    "data-theme-scale": t.scale !== "none" ? t.scale : undefined,
  };
}
