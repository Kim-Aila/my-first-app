import { test, expect, type Page, type TestInfo } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import {
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  P2_ADMIN_ROLE,
  P2_EMAIL_DOMAIN,
  P2_PASSWORD,
  P2_REGULAR,
  P2_SUPER_ADMIN,
  P2_TENANT_ADMIN,
  P2_TENANT_NORD,
  P2_TENANT_PREFIX,
  P2_TENANT_SUED,
} from "./fixtures"

// Shared fixtures (2 tenants, "Administrator" role each, super-admin, tenant admin of "Nord",
// regular user) come from tests/global-setup.ts. Anything a test mutates is created per test with
// a unique name (tests run in parallel across chromium + Mobile Safari) and removed in afterEach;
// tests/global-teardown.ts additionally sweeps everything on the PROJ-2 email domain / tenant prefix.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NO_ACCESS = "Kein Zugriff"

let createdUsers: string[] = []
let createdTenants: string[] = []
let createdRoles: string[] = []

test.afterEach(async () => {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id)
  for (const id of createdRoles) await admin.from("roles").delete().eq("id", id)
  for (const id of createdTenants) await admin.from("tenants").delete().eq("id", id)
  createdUsers = []
  createdTenants = []
  createdRoles = []
})

function uid(testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/\W/g, "").toLowerCase().slice(0, 4)
  return `${project}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

async function tenantId(name: string) {
  const { data, error } = await admin.from("tenants").select("id").eq("name", name).single()
  if (error) throw error
  return data.id as string
}

async function roleId(tenant: string, name: string) {
  const { data, error } = await admin
    .from("roles")
    .select("id")
    .eq("tenant_id", tenant)
    .eq("name", name)
    .single()
  if (error) throw error
  return data.id as string
}

async function mkTenant(name: string) {
  const { data, error } = await admin.from("tenants").insert({ name }).select("id").single()
  if (error) throw error
  createdTenants.push(data.id)
  return data.id as string
}

async function mkRole(tenant: string, name: string, withAdminMask: boolean) {
  const { data, error } = await admin.from("roles").insert({ tenant_id: tenant, name }).select("id").single()
  if (error) throw error
  createdRoles.push(data.id)
  if (withAdminMask) {
    await admin.from("role_permissions").insert({ role_id: data.id, module: "basis", maske: "benutzerverwaltung" })
  }
  return data.id as string
}

async function mkUser(
  username: string,
  opts: { tenants?: string[]; roles?: { tenant: string; role: string }[]; superAdmin?: boolean } = {}
) {
  const email = `${username.replace(/[^a-z0-9_]/gi, "").toLowerCase()}@${P2_EMAIL_DOMAIN}`
  const { data, error } = await admin.auth.admin.createUser({ email, password: P2_PASSWORD, email_confirm: true })
  if (error) throw error
  const id = data.user.id
  createdUsers.push(id)
  await admin.from("user_profiles").insert({ id, username, email, is_super_admin: opts.superAdmin ?? false })
  for (const t of opts.tenants ?? []) await admin.from("user_tenant_access").insert({ user_id: id, tenant_id: t })
  for (const r of opts.roles ?? []) {
    await admin.from("user_roles").insert({ user_id: id, tenant_id: r.tenant, role_id: r.role })
  }
  return { id, username, email }
}

async function trackUserByName(username: string) {
  const { data } = await admin.from("user_profiles").select("id").eq("username", username).maybeSingle()
  if (data) createdUsers.push(data.id)
  return data?.id as string | undefined
}

async function passwordWorks(email: string, password: string) {
  const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await anon.auth.signInWithPassword({ email, password })
  return !error
}

async function login(page: Page, username: string, password = P2_PASSWORD) {
  await page.goto("/login")
  await page.getByLabel("Benutzername").fill(username)
  await page.getByLabel("Passwort").fill(password)
  await page.getByRole("button", { name: "Anmelden" }).click()
  await expect(page).toHaveURL("/")
}

// On narrow screens the role-name cell also contains an "N Benutzer" sub-line.
function roleCell(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return page.getByRole("cell", { name: new RegExp(`^${escaped}( \\d+ Benutzer)?$`) })
}

async function logout(page: Page) {
  await page.context().clearCookies()
}

test.describe("PROJ-2: Benutzerverwaltung & Rollen-/Rechtesystem", () => {
  test("AC-1: super-admin creates a tenant; it is listed immediately without roles or users", async ({ page }, testInfo) => {
    const name = `${P2_TENANT_PREFIX}Neu ${uid(testInfo)}`
    await login(page, P2_SUPER_ADMIN)
    await page.goto("/mandanten")
    await page.getByRole("button", { name: "Neuer Mandant" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name").fill(name)
    await dialog.getByRole("button", { name: "Anlegen" }).click()

    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()
    const id = await tenantId(name)
    createdTenants.push(id)

    const { count: roles } = await admin.from("roles").select("id", { count: "exact", head: true }).eq("tenant_id", id)
    const { count: users } = await admin
      .from("user_tenant_access")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", id)
    expect(roles).toBe(0)
    expect(users).toBe(0)

    await page.goto(`/benutzerverwaltung?mandant=${id}`)
    await expect(page.getByText("Noch keine Benutzer in diesem Mandanten")).toBeVisible()
    await page.getByRole("tab", { name: /Rollen/ }).click()
    await expect(page.getByText("Noch keine Rollen in diesem Mandanten")).toBeVisible()
  })

  test("AC-2: first 'Administrator' role + first user in a fresh tenant; user logs in and reaches Benutzerverwaltung", async ({ page }, testInfo) => {
    const id = uid(testInfo)
    const tenantName = `${P2_TENANT_PREFIX}Frisch ${id}`
    const tenant = await mkTenant(tenantName)
    const username = `e2e_p2_first_${id}`

    await login(page, P2_SUPER_ADMIN)
    await page.goto(`/benutzerverwaltung?mandant=${tenant}`)

    await page.getByRole("tab", { name: /Rollen/ }).click()
    await page.getByRole("button", { name: "Neue Rolle" }).click()
    let dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name").fill("Administrator")
    await dialog.getByLabel("Benutzerverwaltung").check()
    await dialog.getByRole("button", { name: "Rolle anlegen" }).click()
    await expect(roleCell(page, "Administrator")).toBeVisible()

    await page.getByRole("tab", { name: /Benutzer/ }).click()
    await page.getByRole("button", { name: "Neuer Benutzer" }).click()
    dialog = page.getByRole("dialog")
    await dialog.getByLabel("Benutzername").fill(username)
    await dialog.getByLabel("E-Mail").fill(`${username}@${P2_EMAIL_DOMAIN}`)
    await dialog.getByLabel("Initial-Passwort").fill(P2_PASSWORD)
    await dialog.getByLabel("Administrator").check()
    await dialog.getByRole("button", { name: "Benutzer anlegen" }).click()
    await expect(page.getByText(username, { exact: true })).toBeVisible({ timeout: 20000 })
    await trackUserByName(username)

    await logout(page)
    await login(page, username)
    await page.goto("/benutzerverwaltung")
    await expect(page.getByRole("heading", { name: "Benutzerverwaltung" })).toBeVisible()
    await expect(page.getByText(`Benutzer und Rollen des Mandanten „${tenantName}“ verwalten`)).toBeVisible()
    await expect(page.getByText(NO_ACCESS)).toHaveCount(0)
  })

  test("AC-3: a tenant admin's new role exists only in their own tenant", async ({ page }, testInfo) => {
    const roleName = `Rolle ${uid(testInfo)}`
    const nord = await tenantId(P2_TENANT_NORD)
    const sued = await tenantId(P2_TENANT_SUED)

    await login(page, P2_TENANT_ADMIN)
    await page.goto("/benutzerverwaltung")
    await page.getByRole("tab", { name: /Rollen/ }).click()
    await page.getByRole("button", { name: "Neue Rolle" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name").fill(roleName)
    await dialog.getByRole("button", { name: "Rolle anlegen" }).click()
    await expect(roleCell(page, roleName)).toBeVisible()

    const { data: rows } = await admin.from("roles").select("id, tenant_id").eq("name", roleName)
    createdRoles.push(...(rows ?? []).map((r) => r.id))
    expect(rows).toHaveLength(1)
    expect(rows![0].tenant_id).toBe(nord)

    // Not usable in the foreign tenant: the API refuses, and assigning it there is rejected
    const foreign = await page.request.post(`/api/tenants/${sued}/roles`, { data: { name: roleName, masks: [] } })
    expect(foreign.status()).toBe(403)
    const assign = await page.request.post(`/api/tenants/${nord}/users`, {
      data: {
        username: `e2e_p2_x_${uid(testInfo)}`,
        email: `x_${uid(testInfo)}@${P2_EMAIL_DOMAIN}`,
        password: P2_PASSWORD,
        roleIds: [await roleId(sued, P2_ADMIN_ROLE)],
      },
    })
    expect(assign.status()).toBe(400)
  })

  test("AC-4: masks of multiple roles are combined (union)", async ({ page }, testInfo) => {
    const id = uid(testInfo)
    const nord = await tenantId(P2_TENANT_NORD)
    const lager = await mkRole(nord, `Lager ${id}`, false)
    const adminRole = await mkRole(nord, `Admin ${id}`, true)
    const user = await mkUser(`e2e_p2_multi_${id}`, { tenants: [nord], roles: [{ tenant: nord, role: lager }] })

    await login(page, user.username)
    await page.goto("/benutzerverwaltung")
    await expect(page.getByText(NO_ACCESS).first()).toBeVisible()

    await admin.from("user_roles").insert({ user_id: user.id, tenant_id: nord, role_id: adminRole })
    await page.goto("/benutzerverwaltung")
    await expect(page.getByRole("heading", { name: "Benutzerverwaltung" })).toBeVisible()
    await expect(page.getByText(NO_ACCESS)).toHaveCount(0)
  })

  test("AC-5: a weak initial password is rejected with a validation error", async ({ page }, testInfo) => {
    const username = `e2e_p2_weak_${uid(testInfo)}`
    await login(page, P2_TENANT_ADMIN)
    await page.goto("/benutzerverwaltung")
    await page.getByRole("button", { name: "Neuer Benutzer" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Benutzername").fill(username)
    await dialog.getByLabel("E-Mail").fill(`${username}@${P2_EMAIL_DOMAIN}`)
    await dialog.getByLabel("Initial-Passwort").fill("abcdefgh")
    await dialog.getByRole("button", { name: "Benutzer anlegen" }).click()
    await expect(dialog.getByText(/Es fehlt: einen Großbuchstaben, eine Zahl, ein Sonderzeichen/)).toBeVisible()

    // Server enforces it too (not just the client)
    const nord = await tenantId(P2_TENANT_NORD)
    const res = await page.request.post(`/api/tenants/${nord}/users`, {
      data: { username, email: `${username}@${P2_EMAIL_DOMAIN}`, password: "Abcdefg1", roleIds: [] },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).field).toBe("password")
    expect(await trackUserByName(username)).toBeUndefined()
  })

  test("AC-6: a username already taken system-wide is rejected", async ({ page }, testInfo) => {
    const id = uid(testInfo)
    await login(page, P2_TENANT_ADMIN)
    await page.goto("/benutzerverwaltung")
    await page.getByRole("button", { name: "Neuer Benutzer" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Benutzername").fill(P2_SUPER_ADMIN) // exists, in no tenant of this admin
    await dialog.getByLabel("E-Mail").fill(`dup_${id}@${P2_EMAIL_DOMAIN}`)
    await dialog.getByLabel("Initial-Passwort").fill(P2_PASSWORD)
    await dialog.getByRole("button", { name: "Benutzer anlegen" }).click()
    await expect(dialog.getByText("Dieser Benutzername ist bereits vergeben.")).toBeVisible()
    await expect(dialog).toBeVisible()
  })

  test("AC-7: correct current password + policy-conform new password changes it and keeps the user logged in", async ({ page }, testInfo) => {
    const nord = await tenantId(P2_TENANT_NORD)
    const user = await mkUser(`e2e_p2_pw_${uid(testInfo)}`, { tenants: [nord] })
    const newPassword = "Neu-E2E-Pw7?"

    await login(page, user.username)
    await page.goto("/profil")
    await page.getByLabel("Aktuelles Passwort").fill(P2_PASSWORD)
    await page.getByLabel("Neues Passwort", { exact: true }).fill(newPassword)
    await page.getByLabel("Neues Passwort bestätigen").fill(newPassword)
    await page.getByRole("button", { name: "Passwort ändern" }).click()
    await expect(page.getByText("Dein Passwort wurde geändert. Du bleibst weiterhin angemeldet.")).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/profil$/)
    expect(await passwordWorks(user.email, newPassword)).toBe(true)
    expect(await passwordWorks(user.email, P2_PASSWORD)).toBe(false)
  })

  test("AC-8: wrong current password rejects the change and keeps the old password", async ({ page }, testInfo) => {
    const nord = await tenantId(P2_TENANT_NORD)
    const user = await mkUser(`e2e_p2_pwf_${uid(testInfo)}`, { tenants: [nord] })

    await login(page, user.username)
    await page.goto("/profil")
    await page.getByLabel("Aktuelles Passwort").fill("Falsch-Pw1!")
    await page.getByLabel("Neues Passwort", { exact: true }).fill("Neu-E2E-Pw7?")
    await page.getByLabel("Neues Passwort bestätigen").fill("Neu-E2E-Pw7?")
    await page.getByRole("button", { name: "Passwort ändern" }).click()
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Das Passwort konnte nicht geändert werden")

    expect(await passwordWorks(user.email, P2_PASSWORD)).toBe(true)
    expect(await passwordWorks(user.email, "Neu-E2E-Pw7?")).toBe(false)
  })

  test("AC-9: removing a user from one tenant keeps other tenants and the account active", async ({ page }, testInfo) => {
    const nord = await tenantId(P2_TENANT_NORD)
    const sued = await tenantId(P2_TENANT_SUED)
    const user = await mkUser(`e2e_p2_shared_${uid(testInfo)}`, { tenants: [nord, sued] })

    await login(page, P2_TENANT_ADMIN)
    await page.goto("/benutzerverwaltung")
    await page.getByRole("button", { name: `Aktionen für ${user.username}` }).click()
    await page.getByRole("menuitem", { name: "Aus diesem Mandanten entfernen" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Entfernen" }).click()
    await expect(page.getByText(user.username, { exact: true })).toHaveCount(0)

    const { data: access } = await admin.from("user_tenant_access").select("tenant_id").eq("user_id", user.id)
    expect(access!.map((a) => a.tenant_id)).toEqual([sued])
    const { data: profile } = await admin.from("user_profiles").select("is_active").eq("id", user.id).single()
    expect(profile!.is_active).toBe(true)

    await logout(page)
    await login(page, user.username)
    await expect(page.getByText(`Zugriff auf 1 Mandant: ${P2_TENANT_SUED}`)).toBeVisible()
  })

  // Regression test for BUG-2 (fixed 2026-09-30): deactivation revokes existing sessions.
  test("AC-10: a globally deactivated user loses access everywhere, including existing sessions", async ({ page, browser }, testInfo) => {
    const nord = await tenantId(P2_TENANT_NORD)
    const user = await mkUser(`e2e_p2_deact_${uid(testInfo)}`, { tenants: [nord] })
    await login(page, user.username) // session opened before deactivation

    const saContext = await browser.newContext()
    const saPage = await saContext.newPage()
    await login(saPage, P2_SUPER_ADMIN)
    const res = await saPage.request.patch(`/api/users/${user.id}`, { data: { isActive: false } })
    expect(res.status()).toBe(200)
    await saContext.close()

    await page.goto("/profil")
    await expect(page).toHaveURL(/\/login$/)
  })

  test("AC-11: deleting a role still assigned removes its masks but not the users' login", async ({ page, browser }, testInfo) => {
    const id = uid(testInfo)
    const nord = await tenantId(P2_TENANT_NORD)
    const roleName = `Temp ${id}`
    const role = await mkRole(nord, roleName, true)
    const user = await mkUser(`e2e_p2_roledel_${id}`, { tenants: [nord], roles: [{ tenant: nord, role }] })

    await login(page, P2_TENANT_ADMIN)
    await page.goto("/benutzerverwaltung")
    await page.getByRole("tab", { name: /Rollen/ }).click()
    await page.getByRole("button", { name: `Rolle ${roleName} löschen` }).click()
    const confirm = page.getByRole("alertdialog")
    await expect(confirm).toContainText("noch 1 Benutzer zugewiesen")
    await confirm.getByRole("button", { name: "Löschen" }).click()
    await expect(roleCell(page, roleName)).toHaveCount(0)

    const userContext = await browser.newContext()
    const userPage = await userContext.newPage()
    await login(userPage, user.username)
    await userPage.goto("/benutzerverwaltung")
    await expect(userPage.getByText(NO_ACCESS).first()).toBeVisible()
    await userContext.close()
  })

  // AC-12 ("exactly one super-admin") is not automated here: it needs a system-wide state with a
  // single super-admin, which would require clearing the flag of the real seeded admin while
  // other tests run in parallel. Verified live in QA with a guarded temporary flip + unit tests.

  test("AC-13: with at least two super-admins, one flag can be removed and cross-tenant rights end", async ({ page, browser }, testInfo) => {
    const id = uid(testInfo)
    const target = await mkUser(`e2e_p2_sa_b_${id}`, { superAdmin: true })

    await login(page, P2_SUPER_ADMIN)
    await page.goto("/globale-benutzer")
    await page.getByRole("switch", { name: `Super-Admin-Recht für ${target.username}` }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Recht entziehen" }).click()
    await expect(page.getByText(`${target.username} ist kein Super-Admin mehr`)).toBeVisible()

    const { data } = await admin.from("user_profiles").select("is_super_admin").eq("id", target.id).single()
    expect(data!.is_super_admin).toBe(false)

    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await login(p, target.username)
    await p.goto("/mandanten")
    await expect(p.getByText(NO_ACCESS).first()).toBeVisible()
    await ctx.close()
  })

  test("AC-14: a tenant admin can only create new users, never attach an existing foreign user", async ({ page }, testInfo) => {
    const nord = await tenantId(P2_TENANT_NORD)
    const sued = await tenantId(P2_TENANT_SUED)
    const foreign = await mkUser(`e2e_p2_foreign_${uid(testInfo)}`, { tenants: [sued] })

    await login(page, P2_TENANT_ADMIN)
    await page.goto("/benutzerverwaltung")
    await page.getByRole("button", { name: "Neuer Benutzer" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Der Benutzer wird neu angelegt")).toBeVisible()
    await expect(dialog.getByRole("combobox")).toHaveCount(0) // no picker for existing users

    // Direct API attempts: reuse the foreign user's email / assign roles to them in Nord
    const byEmail = await page.request.post(`/api/tenants/${nord}/users`, {
      data: { username: `e2e_p2_attach_${uid(testInfo)}`, email: foreign.email, password: P2_PASSWORD, roleIds: [] },
    })
    expect(byEmail.status()).toBe(409)
    const byRoles = await page.request.patch(`/api/tenants/${nord}/users/${foreign.id}`, { data: { roleIds: [] } })
    expect(byRoles.status()).toBe(404)

    const { data: access } = await admin.from("user_tenant_access").select("tenant_id").eq("user_id", foreign.id)
    expect(access!.map((a) => a.tenant_id)).toEqual([sued])
  })

  test("AC-15: a super-admin grants the flag and the user immediately gets cross-tenant access", async ({ page, browser }, testInfo) => {
    const user = await mkUser(`e2e_p2_promote_${uid(testInfo)}`)

    await login(page, P2_SUPER_ADMIN)
    await page.goto("/globale-benutzer")
    await page.getByRole("switch", { name: `Super-Admin-Recht für ${user.username}` }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Recht vergeben" }).click()
    await expect(page.getByText(`${user.username} ist jetzt Super-Admin`)).toBeVisible()

    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await login(p, user.username)
    await p.goto("/mandanten")
    await expect(p.getByRole("cell", { name: P2_TENANT_NORD, exact: true })).toBeVisible()
    await expect(p.getByRole("cell", { name: P2_TENANT_SUED, exact: true })).toBeVisible()
    await ctx.close()
  })

  test("AC-16: a deactivated user with correct credentials gets a clear 'deaktiviert' message", async ({ page, browser }, testInfo) => {
    const nord = await tenantId(P2_TENANT_NORD)
    const user = await mkUser(`e2e_p2_deact_${uid(testInfo)}`, { tenants: [nord] })

    await login(page, P2_SUPER_ADMIN)
    await page.goto("/globale-benutzer")
    await page.getByRole("button", { name: `${user.username} global deaktivieren` }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Deaktivieren" }).click()
    await expect(page.getByText(`${user.username} wurde global deaktiviert`)).toBeVisible()

    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto("/login")
    await p.getByLabel("Benutzername").fill(user.username)
    await p.getByLabel("Passwort").fill(P2_PASSWORD)
    await p.getByRole("button", { name: "Anmelden" }).click()
    await expect(p.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Dieser Account wurde deaktiviert.")
    await expect(p).toHaveURL(/\/login$/)
    await ctx.close()
  })

  test.describe("Edge cases", () => {
    test("EC-3: duplicate role name in the same tenant is rejected, same name in another tenant is fine", async ({ page }) => {
      await login(page, P2_TENANT_ADMIN)
      await page.goto("/benutzerverwaltung")
      await page.getByRole("tab", { name: /Rollen/ }).click()
      await page.getByRole("button", { name: "Neue Rolle" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("Name").fill(P2_ADMIN_ROLE) // exists in Nord (and, independently, in Süd)
      await dialog.getByRole("button", { name: "Rolle anlegen" }).click()
      await expect(dialog.getByText("In diesem Mandanten gibt es bereits eine Rolle mit diesem Namen")).toBeVisible()

      const nord = await tenantId(P2_TENANT_NORD)
      const res = await page.request.post(`/api/tenants/${nord}/roles`, { data: { name: P2_ADMIN_ROLE, masks: [] } })
      expect(res.status()).toBe(409)
    })

    test("EC-5: API unreachable while saving shows an error and keeps the form input", async ({ page }, testInfo) => {
      const username = `e2e_p2_offline_${uid(testInfo)}`
      await login(page, P2_TENANT_ADMIN)
      await page.goto("/benutzerverwaltung")
      await page.route("**/api/tenants/*/users", (route) => route.abort("connectionrefused"))
      await page.getByRole("button", { name: "Neuer Benutzer" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("Benutzername").fill(username)
      await dialog.getByLabel("E-Mail").fill(`${username}@${P2_EMAIL_DOMAIN}`)
      await dialog.getByLabel("Initial-Passwort").fill(P2_PASSWORD)
      await dialog.getByRole("button", { name: "Benutzer anlegen" }).click()
      await expect(dialog.getByRole("alert")).toHaveText("Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.")
      await expect(dialog.getByLabel("Benutzername")).toHaveValue(username)
      await expect(dialog.getByLabel("E-Mail")).toHaveValue(`${username}@${P2_EMAIL_DOMAIN}`)
      expect(await trackUserByName(username)).toBeUndefined()
    })

    test("EC-6: a tenant admin cannot rename their own tenant", async ({ page }) => {
      await login(page, P2_TENANT_ADMIN)
      await page.goto("/mandanten")
      await expect(page.getByText(NO_ACCESS).first()).toBeVisible()
      const nord = await tenantId(P2_TENANT_NORD)
      const res = await page.request.patch(`/api/tenants/${nord}`, { data: { name: `${P2_TENANT_PREFIX}Umbenannt` } })
      expect(res.status()).toBe(403)
    })
  })

  test.describe("Security", () => {
    test("unauthenticated access to the new pages redirects to /login and APIs return 401", async ({ page }) => {
      for (const path of ["/benutzerverwaltung", "/mandanten", "/globale-benutzer", "/profil"]) {
        await page.goto(path)
        await expect(page).toHaveURL(/\/login$/)
      }
      const res = await page.request.post("/api/tenants", { data: { name: "x" } })
      expect(res.status()).toBe(401)
    })

    test("a regular user without roles sees no admin navigation and cannot call admin APIs", async ({ page }) => {
      const nord = await tenantId(P2_TENANT_NORD)
      const user = await mkUser(`e2e_p2_plain_${Date.now().toString(36)}`, { tenants: [nord] })
      await login(page, user.username)
      await page.goto("/benutzerverwaltung")
      await expect(page.getByText(NO_ACCESS).first()).toBeVisible()
      const res = await page.request.post(`/api/tenants/${nord}/roles`, { data: { name: "x", masks: [] } })
      expect(res.status()).toBe(403)
      const escalate = await page.request.patch(`/api/users/${user.id}`, { data: { isSuperAdmin: true } })
      expect(escalate.status()).toBe(403)
    })

    test("script payloads in tenant, role and user names are rendered as text (no XSS)", async ({ page }, testInfo) => {
      const id = uid(testInfo)
      const payload = `<img src=x onerror="window.__xss=1">`
      const tenant = await mkTenant(`${P2_TENANT_PREFIX}${payload}${id}`)
      await mkRole(tenant, `<script>window.__xss=1</script>${id}`, false)
      await mkUser(`<script>window.__xss=1</script>${id}`, { tenants: [tenant] })

      let dialogFired = false
      page.on("dialog", async (d) => {
        dialogFired = true
        await d.dismiss()
      })
      await login(page, P2_SUPER_ADMIN)
      for (const path of ["/mandanten", `/benutzerverwaltung?mandant=${tenant}`, "/globale-benutzer"]) {
        await page.goto(path)
        await expect(page.getByText(id).first()).toBeVisible()
      }
      await page.goto(`/benutzerverwaltung?mandant=${tenant}`)
      await page.getByRole("tab", { name: /Rollen/ }).click()
      await expect(page.getByText(`<script>window.__xss=1</script>${id}`).first()).toBeVisible()

      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
      expect(dialogFired).toBe(false)
    })
  })

  test.describe("Known bugs (see QA section in the spec)", () => {
    test("BUG-8 (fixed): 'E-Mail bereits registriert' is shown under the E-Mail field", async ({ page }, testInfo) => {
      await login(page, P2_TENANT_ADMIN)
      await page.goto("/benutzerverwaltung")
      await page.getByRole("button", { name: "Neuer Benutzer" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("Benutzername").fill(`e2e_p2_mail_${uid(testInfo)}`)
      await dialog.getByLabel("E-Mail").fill(`${P2_SUPER_ADMIN}@${P2_EMAIL_DOMAIN}`)
      await dialog.getByLabel("Initial-Passwort").fill(P2_PASSWORD)
      await dialog.getByRole("button", { name: "Benutzer anlegen" }).click()
      await expect(dialog.getByText("Diese E-Mail-Adresse ist bereits registriert.")).toBeVisible()
      await expect(dialog.getByLabel("E-Mail")).toHaveAttribute("aria-invalid", "true")
      await expect(dialog.getByLabel("Benutzername")).toHaveAttribute("aria-invalid", "false")
    })

    test("BUG-3 (fixed): a tenant admin can add a role to themself without losing their admin role", async ({ page }, testInfo) => {
      const id = uid(testInfo)
      const nord = await tenantId(P2_TENANT_NORD)
      const adminRole = await roleId(nord, P2_ADMIN_ROLE)
      const extra = await mkRole(nord, `Extra ${id}`, false)
      const self = await mkUser(`e2e_p2_self_${id}`, { tenants: [nord], roles: [{ tenant: nord, role: adminRole }] })
      await login(page, self.username)
      const res = await page.request.patch(`/api/tenants/${nord}/users/${self.id}`, { data: { roleIds: [adminRole, extra] } })
      expect(res.status()).toBe(200)
      const { data } = await admin.from("user_roles").select("role_id").eq("user_id", self.id)
      expect(data).toHaveLength(2)
    })

    test("BUG-3 (fixed): a tenant admin can rename their own admin role without losing its mask", async ({ page }, testInfo) => {
      const id = uid(testInfo)
      const nord = await tenantId(P2_TENANT_NORD)
      const role = await mkRole(nord, `Admin ${id}`, true)
      const self = await mkUser(`e2e_p2_ren_${id}`, { tenants: [nord], roles: [{ tenant: nord, role }] })
      await login(page, self.username)
      const res = await page.request.patch(`/api/tenants/${nord}/roles/${role}`, {
        data: { name: `Admin neu ${id}`, masks: [{ module: "basis", maske: "benutzerverwaltung" }] },
      })
      expect(res.status()).toBe(200)
      const { data } = await admin.from("role_permissions").select("maske").eq("role_id", role)
      expect(data).toEqual([{ maske: "benutzerverwaltung" }])
      // Still a tenant admin afterwards.
      const after = await page.request.post(`/api/tenants/${nord}/roles`, { data: { name: `Nachher ${id}`, masks: [] } })
      expect(after.status()).toBe(201)
      const created = await after.json()
      createdRoles.push(created.id)
    })

    test("BUG-2 (fixed): a deactivated user signing in directly at GoTrue gets no usable access", async ({}, testInfo) => {
      const nord = await tenantId(P2_TENANT_NORD)
      const adminRole = await roleId(nord, P2_ADMIN_ROLE)
      const user = await mkUser(`e2e_p2_gt_${uid(testInfo)}`, { tenants: [nord], roles: [{ tenant: nord, role: adminRole }] })
      await admin.from("user_profiles").update({ is_active: false }).eq("id", user.id)

      const client = userClient()
      const { error } = await client.auth.signInWithPassword({ email: user.email, password: P2_PASSWORD })
      if (error) return // GoTrue rejecting the grant outright is fine too
      const { data: tenants } = await client.from("tenants").select("id")
      expect(tenants).toEqual([])
      const insert = await client.from("roles").insert({ tenant_id: nord, name: "should-not-exist" })
      expect(insert.error).not.toBeNull()
      const reactivate = await client.from("user_profiles").update({ is_active: true }).eq("id", user.id).select("id")
      expect(reactivate.data ?? []).toHaveLength(0)
    })

    test("BUG-4 (fixed): revoke_super_admin() RPC rejects callers who are not super-admins", async () => {
      const client = userClient()
      await client.auth.signInWithPassword({ email: `${P2_TENANT_ADMIN}@${P2_EMAIL_DOMAIN}`, password: P2_PASSWORD })
      const { data: sa } = await admin.from("user_profiles").select("id").eq("username", P2_SUPER_ADMIN).single()
      const { error } = await client.rpc("revoke_super_admin", { target_id: sa!.id })
      expect(error?.code).toBe("42501")
      const { data: after } = await admin.from("user_profiles").select("is_super_admin").eq("id", sa!.id).single()
      expect(after!.is_super_admin).toBe(true)
    })

    test("BUG-6 (fixed): GoTrue self-signup is disabled", async ({}, testInfo) => {
      const { data, error } = await userClient().auth.signUp({
        email: `e2e_p2_signup_${uid(testInfo)}@${P2_EMAIL_DOMAIN}`,
        password: P2_PASSWORD,
      })
      if (data.user) createdUsers.push(data.user.id)
      expect(error?.code).toBe("signup_disabled")
    })

    test("BUG-7 (fixed): a weak password set directly via GoTrue is rejected", async ({}, testInfo) => {
      const nord = await tenantId(P2_TENANT_NORD)
      const user = await mkUser(`e2e_p2_weak_${uid(testInfo)}`, { tenants: [nord] })
      const client = userClient()
      await client.auth.signInWithPassword({ email: user.email, password: P2_PASSWORD })
      for (const weak of ["abcdef", "Abcdefg1", "abcdefg1!"]) {
        const { error } = await client.auth.updateUser({ password: weak })
        expect(error?.code, weak).toBe("weak_password")
      }
      expect(await passwordWorks(user.email, P2_PASSWORD)).toBe(true)
    })

    test("BUG-9 (fixed): the database rejects a role assignment pointing at another tenant's role", async () => {
      const nord = await tenantId(P2_TENANT_NORD)
      const sued = await tenantId(P2_TENANT_SUED)
      const suedRole = await roleId(sued, P2_ADMIN_ROLE)
      const { data: regular } = await admin.from("user_profiles").select("id").eq("username", P2_REGULAR).single()
      const client = userClient()
      await client.auth.signInWithPassword({ email: `${P2_TENANT_ADMIN}@${P2_EMAIL_DOMAIN}`, password: P2_PASSWORD })
      const { error } = await client.from("user_roles").insert({ user_id: regular!.id, tenant_id: nord, role_id: suedRole })
      expect(error?.code).toBe("23503")
      const { data } = await admin.from("user_roles").select("id").eq("user_id", regular!.id).eq("role_id", suedRole)
      expect(data).toHaveLength(0)
    })

    test("BUG-10/11 (fixed): '*' in tenant names works; names differing only in case are duplicates", async ({ page }, testInfo) => {
      const id = uid(testInfo)
      await login(page, P2_SUPER_ADMIN)
      const star = await page.request.post("/api/tenants", { data: { name: `${P2_TENANT_PREFIX}N*${id}` } })
      expect(star.status()).toBe(201)
      createdTenants.push((await star.json()).id)
      const tenantCase = await page.request.post("/api/tenants", { data: { name: `${P2_TENANT_PREFIX}N*${id}`.toUpperCase() } })
      expect(tenantCase.status()).toBe(409)

      const nord = await tenantId(P2_TENANT_NORD)
      await mkRole(nord, `Lager ${id}`, false)
      const roleCase = await page.request.post(`/api/tenants/${nord}/roles`, { data: { name: `LAGER ${id}`.toUpperCase(), masks: [] } })
      expect(roleCase.status()).toBe(409)

      const upper = P2_REGULAR.toUpperCase()
      const userCase = await page.request.post(`/api/tenants/${nord}/users`, {
        data: { username: upper, email: `e2e_p2_case_${id}@${P2_EMAIL_DOMAIN}`, password: P2_PASSWORD, roleIds: [] },
      })
      await trackUserByName(upper)
      expect(userCase.status()).toBe(409)
      expect((await userCase.json()).field).toBe("username")
    })
  })
})

function userClient() {
  return createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
