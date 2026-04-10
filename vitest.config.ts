import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      'tests/e2e/**',
      '**/*.e2e.{test,spec}.?(c|m)[jt]s?(x)',
      'playwright.config.*',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
