/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Noto Sans KR', 'sans-serif'],
                display: ['Black Han Sans', 'sans-serif'],
            },
            colors: {
                'sb-bg': '#0f172a',
                'sb-panel': '#1e293b',
                'sb-gold': '#fbbf24',
                'sb-blue': '#3b82f6',
                'sb-green': '#10b981',
                'sb-red': '#ef4444',
            },
            backgroundImage: {
                'card-grad':
                    'linear-gradient(145deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 45%, rgba(51, 65, 85, 0.35) 100%)',
            },
        },
    },
    plugins: [],
};
