import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
}

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

type AnySupabaseClient = ReturnType<typeof createClient>

export const supabaseAdmin: AnySupabaseClient =
  typeof window === 'undefined'
    ? (() => {
        if (!supabaseServiceKey) {
          throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
        }
        return createClient(supabaseUrl, supabaseServiceKey)
      })()
    : (null as unknown as AnySupabaseClient)
