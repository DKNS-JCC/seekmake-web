import type { Config } from 'tailwindcss';

// Mirrors the inline `tailwind.config` from every legacy HTML page.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2c3e50',
        secondary: '#34495e',
        accent: '#3498db'
      },
      animation: {
        // Used by the homepage scroll indicator (hero section).
        'bounce-slow': 'bounce 2s infinite'
      }
    }
  },
  plugins: []
};

export default config;
