/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#050508',
        surface: '#0d0d14',
        card:    '#0a0a12',
        border:  '#1a1a2e',
        muted:   '#4a4a6a',
        green:   '#00ff88',
        red:     '#ff3366',
        blue:    '#3366ff',
        amber:   '#ffaa00',
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        sans: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
