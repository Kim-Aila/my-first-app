import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_ROLE_KEY,
  TEST_USERNAME,
  TEST_EMAIL,
  TEST_PASSWORD,
  P2_EMAIL_DOMAIN,
  P2_TENANT_NORD,
  P2_TENANT_SUED,
  P2_ADMIN_ROLE,
  P2_PASSWORD,
  P2_SUPER_ADMIN,
  P2_TENANT_ADMIN,
  P2_REGULAR,
} from "./fixtures"

// Runs once before ALL projects (chromium, Mobile Safari, ...) start — unlike a per-file
// beforeAll, which runs once per project and races when projects execute in parallel.
export default async function globalSetup() {
  const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await setupProj1(admin)
  await setupProj2(admin)
}

async function setupProj1(admin: SupabaseClient) {
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

// PROJ-2: two tenants, an "Administrator" role (mask basis/benutzerverwaltung) in each, a
// super-admin, a tenant admin of "Nord" and a regular (role-less) user of "Nord".
async function setupProj2(admin: SupabaseClient) {
  const { data: existing } = await admin
    .from("user_profiles")
    .select("id")
    .eq("username", P2_SUPER_ADMIN)
    .maybeSingle()
  if (existing) return

  const tenantIds: Record<string, string> = {}
  for (const name of [P2_TENANT_NORD, P2_TENANT_SUED]) {
    const { data, error } = await admin.from("tenants").insert({ name }).select("id").single()
    if (error) throw error
    tenantIds[name] = data.id
    const { data: role, error: roleError } = await admin
      .from("roles")
      .insert({ tenant_id: data.id, name: P2_ADMIN_ROLE })
      .select("id")
      .single()
    if (roleError) throw roleError
    const { error: permError } = await admin
      .from("role_permissions")
      .insert({ role_id: role.id, module: "basis", maske: "benutzerverwaltung" })
    if (permError) throw permError
  }

  const nord = tenantIds[P2_TENANT_NORD]
  const { data: nordAdminRole } = await admin
    .from("roles")
    .select("id")
    .eq("tenant_id", nord)
    .eq("name", P2_ADMIN_ROLE)
    .single()

  const users: { username: string; superAdmin: boolean; tenant?: string; roleId?: string }[] = [
    { username: P2_SUPER_ADMIN, superAdmin: true },
    { username: P2_TENANT_ADMIN, superAdmin: false, tenant: nord, roleId: nordAdminRole!.id },
    { username: P2_REGULAR, superAdmin: false, tenant: nord },
  ]

  for (const u of users) {
    const email = `${u.username}@${P2_EMAIL_DOMAIN}`
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: P2_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    const id = created.user.id
    const { error: profileError } = await admin
      .from("user_profiles")
      .insert({ id, username: u.username, email, is_super_admin: u.superAdmin })
    if (profileError) throw profileError
    if (u.tenant) {
      await admin.from("user_tenant_access").insert({ user_id: id, tenant_id: u.tenant })
      if (u.roleId) {
        await admin.from("user_roles").insert({ user_id: id, tenant_id: u.tenant, role_id: u.roleId })
      }
    }
  }
}
