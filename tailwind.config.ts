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
        gray: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, v(`gray-${n}`)])
        ),
        // Legacy `brand-*` classes follow the active preset's primary colour.
        brand: {
          50: "color-mix(in oklab, var(--primary) calc(<alpha-value> * 6%), var(--background))",
          100: "color-mix(in oklab, var(--primary) calc(<alpha-value> * 12%), var(--background))",
          200: "color-mix(in oklab, var(--primary) calc(<alpha-value> * 25%), var(--background))",
          300: "color-mix(in oklab, var(--primary) calc(<alpha-value> * 45%), var(--background))",
          400: "color-mix(in oklab, var(--primary) calc(<alpha-value> * 70%), var(--background))",
          500: v("primary"),
          600: v("primary"),
          700: v("primary"),
          800: v("primary"),
          900: v("primary"),
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
        sans: ["var(--text-family)", "system-ui", "sans-serif"],
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
