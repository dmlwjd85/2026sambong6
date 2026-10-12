import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function inlineBuiltCss() {
    return {
        name: 'inline-built-css',
        apply: 'build',
        closeBundle() {
            const dist = path.resolve('dist');
            const htmlPath = path.join(dist, 'index.html');
            if (!fs.existsSync(htmlPath)) return;
            let html = fs.readFileSync(htmlPath, 'utf8');
            const link = html.match(/<link rel="stylesheet"[^>]*href="(\/2026sambong6\/assets\/[^"]+\.css)"[^>]*>/);
            if (link) {
                const cssFile = path.join(dist, link[1].replace('/2026sambong6/', ''));
                const css = fs.readFileSync(cssFile, 'utf8').replace(/<\/style/gi, '<\\/style');
                html = html.replace(link[0], () => `<style>${css}</style>`);
            }
            const fontsPath = path.resolve('public/fonts/fonts.css');
            if (fs.existsSync(fontsPath) && html.includes('href="fonts/fonts.css"')) {
                const fonts = fs.readFileSync(fontsPath, 'utf8').replace(/url\('\.\//g, "url('fonts/");
                html = html.replace('<link rel="stylesheet" href="fonts/fonts.css">', () => `<style>${fonts}</style>`);
            }
            fs.writeFileSync(htmlPath, html);
        },
    };
}

// GitHub Pages 프로젝트 페이지: https://dmlwjd85.github.io/2026sambong6/
export default defineConfig({
    plugins: [react(), inlineBuiltCss()],
    base: '/2026sambong6/',
});
