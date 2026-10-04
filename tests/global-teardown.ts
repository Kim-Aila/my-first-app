import { createClient } from "@supabase/supabase-js"
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_ROLE_KEY,
  TEST_USERNAME,
  P2_EMAIL_DOMAIN,
  P2_TENANT_PREFIX,
  P3_EMAIL_DOMAIN,
  P3_TENANT_PREFIX,
} from "./fixtures"

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

  // PROJ-2: every auth user on the PROJ-2 test domain (fixtures + users created by tests).
  // Deleting the auth user cascades to user_profiles / user_tenant_access / user_roles.
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const user of data.users) {
      const email = user.email ?? ""
      if (email.endsWith(`@${P2_EMAIL_DOMAIN}`) || email.endsWith(`@${P3_EMAIL_DOMAIN}`)) {
        await admin.auth.admin.deleteUser(user.id)
      }
    }
    if (data.users.length < 200) break
  }

  // PROJ-2: every tenant created by tests (cascades to roles / role_permissions / user_roles).
  const { data: tenants } = await admin.from("tenants").select("id, name")
  for (const tenant of tenants ?? []) {
    if (tenant.name.startsWith(P2_TENANT_PREFIX) || tenant.name.startsWith(P3_TENANT_PREFIX)) {
      await admin.from("tenants").delete().eq("id", tenant.id)
    }
  }
}
