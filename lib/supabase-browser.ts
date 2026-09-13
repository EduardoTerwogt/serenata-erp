'use client'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
}

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
}

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey)

// EF-2 1A-2: seam de solo-test para que Playwright pueda inspeccionar canales
// de Realtime reales (ej. detectar canales huérfanos tras una reconexión) sin
// tocar código de producción. Gateado por una env var NEXT_PUBLIC_* que solo
// se fija en el job `live` de CI (.github/workflows/e2e.yml) -- en cualquier
// otro build (incluida producción) esta rama nunca corre.
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_E2E_TEST_HOOKS === 'true') {
  ;(window as unknown as { __e2eSupabaseBrowser?: typeof supabaseBrowser }).__e2eSupabaseBrowser = supabaseBrowser
}
