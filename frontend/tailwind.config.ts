import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        inter: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          50:  "#E6E6F0",
          100: "#C7CAD9",
          200: "#9CA0B5",
          300: "#6E7290",
          400: "#494C66",
          500: "#2E3046",
          600: "#1C1D30",
          700: "#141425",
          800: "#0D0D1A",
          900: "#07070C",
        },
        brand: {
          cyan:   "#22D3EE",
          violet: "#A855F7",
          pink:   "#F472B6",
          mint:   "#34D399",
          amber:  "#FBBF24",
          rose:   "#FB7185",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #22D3EE 0%, #A855F7 55%, #F472B6 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgba(34,211,238,0.18) 0%, rgba(168,85,247,0.18) 55%, rgba(244,114,182,0.18) 100%)",
        "mesh-1":
          "radial-gradient(at 20% 20%, rgba(34,211,238,0.25) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(168,85,247,0.22) 0px, transparent 50%), radial-gradient(at 40% 100%, rgba(244,114,182,0.18) 0px, transparent 50%)",
      },
      boxShadow: {
        glow: "0 0 40px -5px rgba(34,211,238,0.35), 0 0 80px -20px rgba(168,85,247,0.25)",
        "glow-violet":
          "0 0 30px -5px rgba(168,85,247,0.55), 0 0 80px -20px rgba(168,85,247,0.35)",
        "glow-cyan":
          "0 0 30px -5px rgba(34,211,238,0.55), 0 0 80px -20px rgba(34,211,238,0.35)",
        "glass-inset":
          "inset 0 1px 0 0 rgba(255,255,255,0.07), 0 30px 60px -30px rgba(0,0,0,0.8)",
      },
      animation: {
        "spin-slow":      "spin 6s linear infinite",
        "aurora":         "aurora 18s ease infinite",
        "shimmer":        "shimmer 2.6s linear infinite",
        "float":          "float 6s ease-in-out infinite",
        "glow-pulse":     "glowPulse 3s ease-in-out infinite",
        "gradient-pan":   "gradientPan 10s ease infinite",
      },
      keyframes: {
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%":      { transform: "translate3d(2%, -2%, 0) rotate(8deg)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.55" },
          "50%":      { opacity: "1" },
        },
        gradientPan: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%":      { backgroundPosition: "100% 50%" },
        },
      },
      backdropBlur: {
        "3xl": "40px",
      },
    },
  },
  plugins: [],
};

export default config;
