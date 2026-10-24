import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/linxi': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
      },
    },
  },
})
