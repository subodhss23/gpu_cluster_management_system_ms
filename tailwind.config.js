/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        void: "#060607",
        panel: "#0C0D0E",
        panel2: "#121315",
        panel3: "#1A1C1E",
        line: "#232527",
        nv: "#76B900",
        "nv-dim": "#4d7a00",
        "nv-glow": "#a3e635",
        amberx: "#F5A623",
        cyanx: "#22D3EE",
        violetx: "#A78BFA",
        rose: "#FB7185",
        muted: "#9CA3AF"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      boxShadow: {
        glow: "0 0 24px rgba(118,185,0,0.35)",
        card: "0 8px 32px rgba(0,0,0,0.45)"
      }
    }
  },
  plugins: []
};
