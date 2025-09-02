import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // server: {
  //   host: true, // Listen on all addresses, including LAN and public IPs
  // },
  plugins: [react(),tailwindcss()],
})
