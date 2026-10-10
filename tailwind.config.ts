import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 700: "#14264f", 800: "#0c1a3a", 900: "#070f26", 950: "#040918" },
        teal: { 50: "#ecfeff", 100: "#cffafe", 600: "#0e7490", 700: "#155e75" },
      },
      // Seluruh aplikasi memakai Arial (cadangan: Helvetica/Liberation Sans yang metriknya sama bila Arial tidak terpasang).
      fontFamily: {
        sans: ["Arial", "Helvetica", "Liberation Sans", "sans-serif"],
        display: ["Arial", "Helvetica", "Liberation Sans", "sans-serif"],
      },
      borderRadius: { DEFAULT: "0.625rem" },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / .04), 0 10px 28px -14px rgb(15 23 42 / .14)",
        glow: "0 0 0 1px rgb(34 211 238 / .25), 0 10px 32px -10px rgb(34 211 238 / .55)",
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
      },
      animation: { rise: "rise .45s ease-out both", float: "float 9s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
