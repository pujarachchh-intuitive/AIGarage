/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'theme-bg': '#05070d',
        'glass': 'rgba(15, 20, 35, 0.55)',
        'breaking': '#ff3b5c',
        'needs-update': '#ffb020',
        'safe': '#6b7280',
        'fixed': '#22e39a',
        'bob-found': '#a78bfa',
        'parser': '#38bdf8',
        'pii': '#f472b6',
        'approval': '#facc15',
      },
      backdropBlur: {
        'glass': '10px',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
