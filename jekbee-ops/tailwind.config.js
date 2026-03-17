/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        amber: {
          400: '#FFD700',
          500: '#F5C400',
          600: '#E6B800',
        },
        dark: {
          900: '#0D0D0D',
          800: '#1A1A1A',
          700: '#242424',
          600: '#2E2E2E',
          500: '#383838',
          400: '#484848',
        },
        service: {
          SEO: '#4ADE80',
          PPC: '#60A5FA',
          SocialAds: '#F472B6',
          YouTubeAds: '#F87171',
          OrganicSocial: '#A78BFA',
          eCRM: '#34D399',
          CRO: '#FBBF24',
          UX: '#38BDF8',
          Design: '#E879F9',
          Development: '#94A3B8',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
