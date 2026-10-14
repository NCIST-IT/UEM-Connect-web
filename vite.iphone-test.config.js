import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  input: resolve(import.meta.dirname, 'iphone-test.html'),
  build: { outDir: '.local/iphone-test', emptyOutDir: true },
})
