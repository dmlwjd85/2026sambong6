import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 프로젝트 페이지: https://dmlwjd85.github.io/sambong-FC/
export default defineConfig({
    plugins: [react()],
    base: '/sambong-FC/',
});
