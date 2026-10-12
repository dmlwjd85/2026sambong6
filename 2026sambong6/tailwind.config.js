/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
    theme: {
        fontSize: {
            12: ['12px', { lineHeight: '1.5', fontWeight: '500' }],
            14: ['14px', { lineHeight: '1.5', fontWeight: '500' }],
            16: ['16px', { lineHeight: '1.5', fontWeight: '500' }],
            20: ['20px', { lineHeight: '1.5', fontWeight: '700' }],
            24: ['24px', { lineHeight: '1.5', fontWeight: '700' }],
            32: ['32px', { lineHeight: '1.5', fontWeight: '700' }],
            48: ['48px', { lineHeight: '1.5', fontWeight: '700' }],
        },
        extend: {
            fontFamily: {
                sans: ['Pretendard', 'sans-serif'],
                display: ['Gowun Batang', 'Pretendard', 'serif'],
                logo: ['Cinzel', 'serif'],
            },
        },
    },
    plugins: [],
};
