import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        telegram: {
          blue: '#2481cc',
          'light-blue': '#64b5ef',
          'dark-blue': '#1c5a85',
          green: '#4dcd5e',
          red: '#e53e3e',
          yellow: '#f5a623',
          accent: '#64b5ef',
          bg: '#ffffff',
          sidebar: '#f4f4f5',
          chat: '#f8fafc',
          'input-bg': '#f0f0f0',
          text: '#000000',
          secondary: '#6b7280',
          tertiary: '#9ca3af',
          border: '#e5e7eb',
        },
      },
      boxShadow: {
        'telegram-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'telegram': '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
        'telegram-lg': '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
        'telegram-xl': '0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
      },
      animation: {
        'slide-in-right': 'slideInFromRight 0.3s ease-out forwards',
        'slide-in-left': 'slideInFromLeft 0.3s ease-out forwards',
        'slide-in-top': 'slideInFromTop 0.3s ease-out forwards',
        'slide-in-bottom': 'slideInFromBottom 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
        'menu-slide-in': 'menuSlideIn 0.2s ease-out forwards',
      },
      keyframes: {
        slideInFromRight: {
          from: {
            opacity: '0',
            transform: 'translateX(20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },
        slideInFromLeft: {
          from: {
            opacity: '0',
            transform: 'translateX(-20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },
        slideInFromTop: {
          from: {
            opacity: '0',
            transform: 'translateY(-20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        slideInFromBottom: {
          from: {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        fadeIn: {
          from: {
            opacity: '0',
          },
          to: {
            opacity: '1',
          },
        },
        scaleIn: {
          from: {
            opacity: '0',
            transform: 'scale(0.95)',
          },
          to: {
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        menuSlideIn: {
          from: {
            opacity: '0',
            transform: 'translateY(-8px) scale(0.95)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0) scale(1)',
          },
        },
      },
      borderRadius: {
        telegram: '12px',
        'telegram-lg': '16px',
        'telegram-xl': '20px',
      },
      spacing: {
        'telegram': '12px',
        'telegram-lg': '16px',
        'telegram-xl': '20px',
      },
      transitionDuration: {
        'telegram': '200ms',
        'telegram-fast': '150ms',
        'telegram-slow': '300ms',
      },
    },
  },
  plugins: [],
}
export default config
