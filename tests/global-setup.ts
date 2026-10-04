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
  P3_EMAIL_DOMAIN,
  P3_TENANT,
  P3_TENANT_LEER,
  P3_TENANT_FREMD,
  P3_PASSWORD,
  P3_EINKAUF,
  P3_EINKAUF2,
  P3_LAGER,
  P3_OHNE,
  P3_LEER,
  P3_FREMD,
  P3_MERKMAL_ONLY,
  P3_BASE_CODE,
} from "./fixtures"

// Runs once before ALL projects (chromium, Mobile Safari, ...) start — unlike a per-file
// beforeAll, which runs once per project and races when projects execute in parallel.
export default async function globalSetup() {
  const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await setupProj1(admin)
  await setupProj2(admin)
  await setupProj3(admin)
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

// PROJ-3: a tenant with Merkmale, an empty tenant, a foreign tenant; roles with different
// Artikelstamm/Merkmal rights and one user per role.
async function setupProj3(admin: SupabaseClient) {
  const { data: existing } = await admin
    .from("user_profiles")
    .select("id")
    .eq("username", P3_EINKAUF)
    .maybeSingle()
  if (existing) return

  const tenant = async (name: string) => {
    const { data, error } = await admin.from("tenants").insert({ name }).select("id").single()
    if (error) throw error
    return data.id as string
  }
  const role = async (tenantId: string, name: string, perms: [string, "read" | "write"][]) => {
    const { data, error } = await admin.from("roles").insert({ tenant_id: tenantId, name }).select("id").single()
    if (error) throw error
    if (perms.length > 0) {
      const { error: permError } = await admin.from("role_permissions").insert(
        perms.map(([maske, access_level]) => ({ role_id: data.id, module: "warenwirtschaft", maske, access_level }))
      )
      if (permError) throw permError
    }
    return data.id as string
  }

  const t = await tenant(P3_TENANT)
  const tLeer = await tenant(P3_TENANT_LEER)
  const tFremd = await tenant(P3_TENANT_FREMD)

  const merkmalMasks: [string, "write"][] = [
    "merkmal_artikeltyp",
    "merkmal_markeninhaber",
    "merkmal_saison",
    "merkmal_basisartikel",
    "merkmal_form_design",
    "merkmal_packungsgroesse",
    "merkmal_geschmackssorte",
    "merkmal_mwst",
    "merkmal_verpackungsgruppe",
  ].map((m) => [m, "write"])

  const rEinkauf = await role(t, "Einkauf", [["artikelstamm", "write"], ...merkmalMasks])
  const rLager = await role(t, "Lager", [["artikelstamm", "read"]])
  const rOhne = await role(t, "Ohne Warenwirtschaft", [])
  const rSaison = await role(t, "Saisonpflege", [["merkmal_saison", "write"]])
  const rLeer = await role(tLeer, "Einkauf", [["artikelstamm", "write"], ...merkmalMasks])
  const rFremd = await role(tFremd, "Einkauf", [["artikelstamm", "write"], ...merkmalMasks])

  // Merkmale of the main tenant (Superuser, bypasses RLS).
  await admin.from("seasons").insert({ tenant_id: t, code: "SOM", name: "Sommer", commodity_digit: 3 })
  await admin.from("article_types").insert({ tenant_id: t, code: "FW", name: "Fertigware", commodity_digit: 4 })
  await admin
    .from("base_articles")
    .insert({ tenant_id: t, code: P3_BASE_CODE, name: "Tafelschokolade", customs_tariff_number: "18063210" })

  const users: [string, string, string | null][] = [
    [P3_EINKAUF, t, rEinkauf],
    [P3_EINKAUF2, t, rEinkauf],
    [P3_LAGER, t, rLager],
    [P3_OHNE, t, rOhne],
    [P3_MERKMAL_ONLY, t, rSaison],
    [P3_LEER, tLeer, rLeer],
    [P3_FREMD, tFremd, rFremd],
  ]
  for (const [username, tenantId, roleId] of users) {
    const email = `${username}@${P3_EMAIL_DOMAIN}`
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: P3_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    const id = created.user.id
    await admin.from("user_profiles").insert({ id, username, email, is_super_admin: false })
    await admin.from("user_tenant_access").insert({ user_id: id, tenant_id: tenantId })
    if (roleId) await admin.from("user_roles").insert({ user_id: id, tenant_id: tenantId, role_id: roleId })
  }
}
