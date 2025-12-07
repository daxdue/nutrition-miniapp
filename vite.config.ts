import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowed = "nutrition-assistant-backend-production-cd64.up.railway.app";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,              // required so Vite listens on 0.0.0.0
    port: 5173,
    strictPort: true,
    allowedHosts: allowed ? [allowed] : [],
  },
})
