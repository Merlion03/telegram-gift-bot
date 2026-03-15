/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        telegram: {
          blue: '#2481cc',
          lightblue: '#64b5ef', 
          darkblue: '#1c5a85',
          bg: '#212d3b',
          sidebar: '#17212b',
          chat: '#0e1621',
          bubble: '#2b5278',
          text: '#ffffff',
          secondary: '#8596a8',
          border: '#2f3b4c',
          accent: '#64b5ef',
          green: '#4dcd5e',
          red: '#e53e3e',
        },
        gray: {
          25: '#fafafa',
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        }
      },
      fontFamily: {
        'telegram': ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'telegram': '0 2px 8px rgba(0, 0, 0, 0.15)',
        'telegram-hover': '0 4px 16px rgba(0, 0, 0, 0.2)',
      }
    },
  },
  plugins: [],
}
