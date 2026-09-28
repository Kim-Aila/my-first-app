// Service-role Supabase client — SERVER-ONLY, bypasses Row Level Security.
// Only for privileged operations that must run before a user has an authenticated session
// (e.g. resolving a login username to an email, tracking failed-login lockout state).
// Never import this from a Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}
