import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 프로젝트 페이지: https://dmlwjd85.github.io/2026sambong6/
// 로그인 문서는 인라인 CSS만 둡니다. 앱 CSS를 HTML에 다시 넣지 않습니다.
export default defineConfig({
    plugins: [react()],
    base: '/2026sambong6/',
    build: {
        cssCodeSplit: true,
        modulePreload: false,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
                },
            },
        },
    },
});
