import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/seekmake-web/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
