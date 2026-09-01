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
                'sb-bg': '#0b2744',
                'sb-panel': '#082f49',
                'sb-gold': '#facc15',
                'sb-blue': '#38bdf8',
                'sb-green': '#22c55e',
                'sb-red': '#f43f5e',
            },
            backgroundImage: {
                'card-grad':
                    'linear-gradient(145deg, #0b2744 0%, #082f49 48%, #0c4a6e 100%)',
            },
        },
    },
    plugins: [],
};
