import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    allowedHosts: ['.monkeycode-ai.online']
  }
})
