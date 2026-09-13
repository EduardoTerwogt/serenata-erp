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
      // EF-2 1B-1: `server-only` lanza fuera de la condición `react-server`,
      // que Vitest no activa -- sin este alias, cualquier test que toque
      // lib/server/supabase-admin.ts (directo o vía un repositorio) revienta.
      'server-only': path.resolve(__dirname, 'test/shims/server-only.ts'),
    },
  },
})
