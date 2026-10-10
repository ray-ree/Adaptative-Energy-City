import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Adaptative-Energy-City/',
  server: {
    port: 5173,
  },
})
