import type { Config } from "tailwindcss";

/**
 * Job-Seeker — Tailwind config
 * NOTE: your project currently uses Tailwind v4 CSS-first config (@theme in globals.css),
 * so globals.css is the primary drop-in. This file is provided as requested for
 * v3-style setups and editor IntelliSense. All colors resolve from the same HSL
 * custom properties defined in globals.css, so the two stay in sync.
 */
const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          elevated: "hsl(var(--card-elevated))",
          border: "hsl(var(--card-border))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
          strong: "hsl(var(--primary-strong))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      fontSize: {
        // editorial display ramp
        "display-lg": ["clamp(2.75rem, 5vw, 4rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "display": ["clamp(2rem, 3.5vw, 2.75rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        card: "0px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 0 0 hsl(var(--card-border)), 0 12px 40px -24px rgb(0 0 0 / 0.55)",
        pop: "0 24px 60px -20px rgb(0 0 0 / 0.65)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.45), 0 14px 50px -18px hsl(var(--primary) / 0.35)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "card-in": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.8)" },
        },
      },
      animation: {
        "card-in": "card-in 0.55s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
