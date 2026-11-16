/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      // The system font first: San Francisco on Apple devices, Segoe UI on Windows, Inter elsewhere.
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -6px rgba(15, 23, 42, 0.08)",
        float: "0 10px 30px -8px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06)"
      },
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