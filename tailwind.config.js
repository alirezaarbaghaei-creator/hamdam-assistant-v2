/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Vazirmatn", "Tahoma", "sans-serif"],
      },
      colors: {
        primary: {
          50: "#eff8ff",
          100: "#dbeefe",
          200: "#bfe2fe",
          300: "#93d1fd",
          400: "#60b6fa",
          500: "#3b97f6",
          600: "#2579eb",
          700: "#1d63d8",
          800: "#1e51af",
          900: "#1e468a",
        },
      },
    },
  },
  plugins: [],
};
