import { createClient } from "@supabase/supabase-js"
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, TEST_USERNAME } from "./fixtures"

export default async function globalTeardown() {
  const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("username", TEST_USERNAME)
    .maybeSingle()
  if (profile) await admin.auth.admin.deleteUser(profile.id)
}
