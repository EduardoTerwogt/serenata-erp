import 'server-only'
import { createClient } from '@supabase/supabase-js'

// EF-2 1B-1: aislado de lib/supabase.ts (que sigue exportando solo el
// cliente anon, browser-safe) -- `service_role` es prácticamente root de la
// base, así que este módulo nunca debe poder importarse desde un Client
// Component. `server-only` lo garantiza en build time.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
