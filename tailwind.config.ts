import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        user: "var(--user)",
        ai: "var(--ai)",
        line: "var(--line)",
        ok: "var(--ok)",
      },
      fontFamily: {
        sans: ["var(--font-noto-sans-sc)", "var(--font-dm-sans)", "sans-serif"],
        display: ["var(--font-dm-sans)", "var(--font-noto-sans-sc)", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
