import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2015',
    outDir: 'F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/spine-react-test',
    emptyOutDir: true,
  },
})
