import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages(저장소 2026sambong6): https://dmlwjd85.github.io/2026sambong6/
  // 픽북만 별도 저장소(picbook)로 올릴 때는 base를 '/picbook/'로 바꾸면 됩니다.
  base: '/2026sambong6/',
})
