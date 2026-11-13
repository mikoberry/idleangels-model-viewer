import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // wallkit is consumed as a `file:` dependency during development, so its
  // real path (a sibling directory) sits outside the Vite root. The dev server
  // refuses to serve files above the root unless the parent is allowed.
  server: {
    fs: {
      allow: ['.', '..'],
    },
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
