import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"Microsoft JhengHei"',
          '"微軟正黑體"',
          'Arial',
          'sans-serif',
        ],
      },
      animation: {
        'target-pulse': 'target-pulse 1.2s ease-in-out infinite',
        'feedback-in': 'feedback-in 0.15s ease-out forwards',
        'feedback-out': 'feedback-out 0.3s ease-in forwards',
      },
      keyframes: {
        'target-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 0 0 rgba(30, 64, 175, 0.45)',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 0 16px rgba(30, 64, 175, 0)',
            transform: 'scale(1.04)',
          },
        },
        'feedback-in': {
          from: { opacity: '0', transform: 'scale(0.8)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'feedback-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
