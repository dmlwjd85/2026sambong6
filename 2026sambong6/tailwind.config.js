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
                'sb-bg': '#1d6a96',
                'sb-panel': '#0369a1',
                'sb-gold': '#facc15',
                'sb-blue': '#38bdf8',
                'sb-green': '#22c55e',
                'sb-red': '#f43f5e',
            },
            backgroundImage: {
                'card-grad':
                    'linear-gradient(145deg, #38bdf8 0%, #0ea5e9 48%, #0284c7 100%)',
            },
        },
    },
    plugins: [],
};
