/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        // High-density dashboards often use very large rounding (24px - 32px)
        'zarewa': '24px', 
      },
      colors: {
        'zarewa-teal': '#134e4a',
        'zarewa-mint': '#2dd4bf',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}