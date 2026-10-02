import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `--mode single` מפיק קובץ HTML יחיד לתצוגה מקדימה (Artifact); ברירת המחדל היא PWA רגיל.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  define: { __SINGLE__: JSON.stringify(mode === 'single') },
  test: { environment: 'node' },
}))
