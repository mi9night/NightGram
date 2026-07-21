import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // NightGram palette — midnight + neon purple
        midnight: {
          50: "#e8e6f5",
          100: "#cfcbe8",
          200: "#9c94c9",
          300: "#6a5da4",
          400: "#4a3a7f",
          500: "#2e2354",
          600: "#1f1740",
          700: "#160f30",
          800: "#0e0a22",
          900: "#070512",
          950: "#03020a",
        },
        // Neon palette — driven by the accent CSS variables so EVERY usage
        // (text/bg/border/ring/shadow + opacity modifiers) follows the user's
        // accent color. gold & cyan stay semantic (premium / online-info).
        neon: {
          purple: "rgb(var(--accent-main-rgb) / <alpha-value>)",
          violet: "rgb(var(--accent-secondary-rgb) / <alpha-value>)",
          indigo: "rgb(var(--accent-main-rgb) / <alpha-value>)",
          pink: "rgb(var(--accent-tertiary-rgb) / <alpha-value>)",
          cyan: "#22d3ee",
          gold: "#fbbf24",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      boxShadow: {
        glow: "0 0 20px rgb(var(--accent-main-rgb) / 0.5), 0 0 40px rgb(var(--accent-main-rgb) / 0.25)",
        "glow-lg": "0 0 40px rgb(var(--accent-main-rgb) / 0.6), 0 0 80px rgb(var(--accent-secondary-rgb) / 0.35)",
        "glow-pink": "0 0 20px rgb(var(--accent-tertiary-rgb) / 0.5), 0 0 40px rgb(var(--accent-tertiary-rgb) / 0.25)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.37)",
        "inner-glow": "inset 0 0 20px rgb(var(--accent-main-rgb) / 0.15)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "gradient-shift": "gradient-shift 8s ease infinite",
        "float": "float 6s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "aurora": "aurora 12s ease infinite",
        "spin-slow": "spin 20s linear infinite",
        "fade-in": "fade-in 0.6s ease forwards",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        "gradient-shift": {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "0.85", filter: "brightness(1.3)" },
        },
        shimmer: {
          "0%": { "background-position": "-1000px 0" },
          "100%": { "background-position": "1000px 0" },
        },
        aurora: {
          "0%, 100%": { transform: "translate(0, 0) rotate(0deg)" },
          "33%": { transform: "translate(30px, -30px) rotate(120deg)" },
          "66%": { transform: "translate(-20px, 20px) rotate(240deg)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(30px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
