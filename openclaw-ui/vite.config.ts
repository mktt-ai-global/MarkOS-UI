import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredBase = env.VITE_BASE_PATH || '/'
  const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/ws': {
          target: 'ws://127.0.0.1:18789',
          ws: true,
          changeOrigin: true,
        },
        '/v1': {
          target: 'http://127.0.0.1:18789',
          changeOrigin: true,
        },
        '/tools': {
          target: 'http://127.0.0.1:18789',
          changeOrigin: true,
        },
      },
    },
  }
})
