import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const certFile = '.cert/localhost.pem'
const keyFile = '.cert/localhost-key.pem'
const https = fs.existsSync(certFile) && fs.existsSync(keyFile)

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    ...(https ? { https: { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) } } : {}),
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
