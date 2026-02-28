import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f4f4f5",
        mist: "#a1a1aa",
        panel: "#1f2329",
        panelSoft: "#2a2f36",
        accent: "#ff5a2f",
        accentDeep: "#d34a26",
      },
      boxShadow: {
        panel: "0 14px 36px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
