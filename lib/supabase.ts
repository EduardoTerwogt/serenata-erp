import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// EF-2 1B-1: el cliente `service_role` se movió a lib/server/supabase-admin.ts
// (import 'server-only') -- este archivo queda solo con el cliente anon,
// seguro de importar desde cualquier lado (browser incluido).
