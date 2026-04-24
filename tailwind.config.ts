import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rift: {
          bg: "#010a13",
          bgdeep: "#000308",
          panel: "#091428",
          paneldark: "#04101c",
          line: "#1e2328",
          lineglow: "#463714",
          gold: "#c8aa6e",
          goldbright: "#f0e6d2",
          golddark: "#785a28",
          blue: "#0ac8b9",
          bluebright: "#cdfafa",
          bluedeep: "#005a82",
          red: "#e84057",
          redbright: "#ff9aa4",
          reddeep: "#7a1b2a",
          muted: "#5b5a56",
          mutedbright: "#a09b8c",
          fighter: "#c8aa6e",
          tank: "#9aa0a6",
          mage: "#6bd1ff",
          marksman: "#ffb454",
          assassin: "#e84057",
          support: "#8bd48d",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-blue": "0 0 24px rgba(10, 200, 185, 0.55), inset 0 0 12px rgba(10, 200, 185, 0.15)",
        "glow-red": "0 0 24px rgba(232, 64, 87, 0.55), inset 0 0 12px rgba(232, 64, 87, 0.15)",
        "glow-gold": "0 0 22px rgba(200, 170, 110, 0.55), inset 0 0 10px rgba(200, 170, 110, 0.15)",
        "inset-gold": "inset 0 0 0 1px rgba(200, 170, 110, 0.35)",
      },
      backgroundImage: {
        "gold-sheen":
          "linear-gradient(135deg, #785a28 0%, #c8aa6e 40%, #f0e6d2 50%, #c8aa6e 60%, #785a28 100%)",
        "blue-sheen":
          "linear-gradient(135deg, #005a82 0%, #0397ab 40%, #0ac8b9 50%, #0397ab 60%, #005a82 100%)",
        "red-sheen":
          "linear-gradient(135deg, #7a1b2a 0%, #c8323c 40%, #e84057 50%, #c8323c 60%, #7a1b2a 100%)",
      },
      keyframes: {
        "slot-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(200,170,110,0.35), 0 0 0 rgba(200,170,110,0.0)" },
          "50%": { boxShadow: "0 0 0 1px rgba(200,170,110,0.9), 0 0 32px rgba(200,170,110,0.85)" },
        },
        "slot-pulse-blue": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(10,200,185,0.4), 0 0 0 rgba(10,200,185,0.0)" },
          "50%": { boxShadow: "0 0 0 1px rgba(10,200,185,0.95), 0 0 34px rgba(10,200,185,0.85)" },
        },
        "slot-pulse-red": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(232,64,87,0.4), 0 0 0 rgba(232,64,87,0.0)" },
          "50%": { boxShadow: "0 0 0 1px rgba(232,64,87,0.95), 0 0 34px rgba(232,64,87,0.85)" },
        },
        "sweep-x": {
          "0%": { transform: "translateX(-120%)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateX(120%)", opacity: "0" },
        },
        "breath": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "float-rune": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)", opacity: "0.08" },
          "50%": { transform: "translateY(-8px) rotate(180deg)", opacity: "0.18" },
        },
      },
      animation: {
        "slot-pulse": "slot-pulse 1.6s ease-in-out infinite",
        "slot-pulse-blue": "slot-pulse-blue 1.6s ease-in-out infinite",
        "slot-pulse-red": "slot-pulse-red 1.6s ease-in-out infinite",
        "sweep-x": "sweep-x 2.2s ease-in-out infinite",
        "breath": "breath 3s ease-in-out infinite",
        "float-rune": "float-rune 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
