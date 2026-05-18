import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        thai: {
          red: "#A51931",
          blue: "#2D2A4A",
        },
      },
    },
  },
  plugins: [],
};

export default config;
