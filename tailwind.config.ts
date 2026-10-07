import type { Config } from "tailwindcss";

const v = (name: string) =>
  `color-mix(in oklab, var(--${name}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: v("background"),
        foreground: v("foreground"),
        card: { DEFAULT: v("card"), foreground: v("card-foreground") },
        popover: { DEFAULT: v("popover"), foreground: v("popover-foreground") },
        primary: { DEFAULT: v("primary"), foreground: v("primary-foreground") },
        secondary: { DEFAULT: v("secondary"), foreground: v("secondary-foreground") },
        muted: { DEFAULT: v("muted"), foreground: v("muted-foreground") },
        accent: { DEFAULT: v("accent"), foreground: v("accent-foreground") },
        destructive: { DEFAULT: v("destructive"), foreground: v("destructive-foreground") },
        border: v("border"),
        input: v("input"),
        ring: v("ring"),
        brand: {
          50: v("base-50"),
          100: v("base-100"),
          200: v("base-200"),
          300: v("base-300"),
          400: v("base-400"),
          500: v("base-600"),
          600: v("base-950"),
          700: v("base-800"),
          800: v("base-900"),
          900: v("base-950"),
        },
        sidebar: {
          bg: v("sidebar-bg"),
          foreground: v("sidebar-foreground"),
          primary: v("sidebar-primary"),
          "primary-foreground": v("sidebar-primary-foreground"),
          accent: v("sidebar-accent"),
          "accent-foreground": v("sidebar-accent-foreground"),
          border: v("sidebar-border"),
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["Overpass Mono", "IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        card: "var(--radius)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
