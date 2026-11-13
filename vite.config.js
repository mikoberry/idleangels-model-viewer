import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // WallKit ships JSX source with no build step; leave it to the React plugin
  // instead of letting the dependency optimiser pre-bundle it.
  optimizeDeps: {
    exclude: ['wallkit'],
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
