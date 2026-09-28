import { createClient } from "@supabase/supabase-js"
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_ROLE_KEY,
  TEST_USERNAME,
  TEST_EMAIL,
  TEST_PASSWORD,
} from "./fixtures"

// Runs once before ALL projects (chromium, Mobile Safari, ...) start — unlike a per-file
// beforeAll, which runs once per project and races when projects execute in parallel.
export default async function globalSetup() {
  const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing } = await admin
    .from("user_profiles")
    .select("id")
    .eq("username", TEST_USERNAME)
    .maybeSingle()
  if (existing) return // already set up from a previous run that didn't tear down cleanly

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("name", "Default")
    .single()
  if (tenantError) throw tenantError

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createError) throw createError

  await admin.from("user_profiles").insert({
    id: created.user.id,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    is_super_admin: false,
  })
  await admin.from("user_tenant_access").insert({ user_id: created.user.id, tenant_id: tenant.id })
}
