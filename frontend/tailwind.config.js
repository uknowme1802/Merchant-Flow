/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#6366F1",
        secondary: "#0EA5E9",
        success: "#22C55E",
        danger: "#EF4444",
        warning: "#F59E0B",
        background: "#F9FAFB"
      }
    }
  },
  plugins: [],
}