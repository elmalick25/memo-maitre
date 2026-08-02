import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react({ include: /\.(jsx|js)$/ }), VitePWA({ registerType: 'prompt' })],
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
})
