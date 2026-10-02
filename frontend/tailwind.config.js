/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        lienzo: '#F8F9FA',
        superficie: '#FFFFFF',
        borde: '#E2E8F0',
        primario: {
          50: '#F1FBFB',
          100: '#DDF4F5',
          200: '#A8DADC',
          300: '#7FCBCD',
          500: '#2F8A8C',
          600: '#256E70',
          700: '#1C5354',
        },
        pastel: {
          verde: '#B5EAD7',
          melocoton: '#FFDAC1',
          rosa: '#FFB7B2',
          lavanda: '#C7CEEA',
          lima: '#E2F0CB',
        },
        tinta: {
          DEFAULT: '#2D3748',
          suave: '#718096',
        },
        alerta: '#FC8181',
        exito: '#68D391',
      },
      borderRadius: {
        control: '12px',
        tarjeta: '16px',
      },
      boxShadow: {
        tarjeta: '0 4px 6px rgba(0, 0, 0, 0.05)',
        'tarjeta-hover': '0 8px 16px rgba(0, 0, 0, 0.08)',
      },
      transitionDuration: {
        200: '200ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'toast-in': 'toast-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
