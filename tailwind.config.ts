import type { Config } from "tailwindcss";
export default { content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: { navy: { 700: "#17325c", 800: "#0f2547", 900: "#0a1a33" }, teal: { 600: "#0f8b8d", 700: "#0b6f71" } } } },
  plugins: [] } satisfies Config;
