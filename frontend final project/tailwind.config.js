/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Semantic brand tokens driven by CSS variables (see index.css).
        brand: {
          DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
          fg: "rgb(var(--color-brand-fg) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--color-gold) / <alpha-value>)",
          fg: "rgb(var(--color-gold-fg) / <alpha-value>)",
          soft: "rgb(var(--color-gold-soft) / <alpha-value>)",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.06)",
        hover: "0 8px 30px rgb(0 0 0 / 0.10)",
      },
    },
  },
  plugins: [import("tailwindcss-animate")],
}
