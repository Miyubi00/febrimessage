/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary — pastel blue scale (required palette)
        pastel: {
          50: '#F7FBFF',
          100: '#EAF6FF',
          200: '#C7E7FF',
          300: '#A9D8FF',
          400: '#8FCBFF',
          500: '#6FB9FF',
          600: '#5EA8FF',
          700: '#3B82F6',
          800: '#2563EB',
          900: '#1E40AF',
        },
        // Text colours — dark navy / blue-gray, never pure black
        ink: {
          DEFAULT: '#1E3A5F',
          soft: '#3D5A80',
          muted: '#7191B4',
        },
        // Accent used sparingly for soft glow only
        lavender: {
          light: '#E7E9FF',
          DEFAULT: '#C9CDFF',
          deep: '#A5A9F5',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Quicksand', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        soft: '0 12px 30px -18px rgba(94, 168, 255, 0.55)',
        card: '0 24px 50px -30px rgba(59, 130, 246, 0.45)',
        glow: '0 0 0 4px rgba(143, 203, 255, 0.35)',
        'glow-lg': '0 0 40px -6px rgba(143, 203, 255, 0.65)',
        float: '0 18px 40px -22px rgba(59, 130, 246, 0.5)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-down': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '60%': { opacity: '1', transform: 'scale(1.01)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        drift: {
          '0%': { transform: 'translateX(-25vw)' },
          '100%': { transform: 'translateX(105vw)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0.25', transform: 'scale(0.8) rotate(0deg)' },
          '50%': { opacity: '1', transform: 'scale(1.15) rotate(20deg)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-down': 'fade-down 0.3s ease-out both',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        float: 'float 6s ease-in-out infinite',
        drift: 'drift 70s linear infinite',
        twinkle: 'twinkle 3s ease-in-out infinite',
        shimmer: 'shimmer 1.8s infinite',
      },
    },
  },
  plugins: [],
};