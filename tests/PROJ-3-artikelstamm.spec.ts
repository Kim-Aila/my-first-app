import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import {
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  P2_PASSWORD,
  P2_TENANT_ADMIN,
  P2_TENANT_NORD,
  P3_BASE_CODE,
  P3_EINKAUF,
  P3_EINKAUF2,
  P3_EMAIL_DOMAIN,
  P3_FREMD,
  P3_LAGER,
  P3_LEER,
  P3_MERKMAL_ONLY,
  P3_OHNE,
  P3_PASSWORD,
  P3_TENANT,
  P3_TENANT_FREMD,
  P3_TENANT_LEER,
  P3_TENANT_PREFIX,
} from "./fixtures"

// Fixtures (3 tenants, roles, users, Merkmale of the main tenant) come from tests/global-setup.ts.
// Everything a test mutates is created per test with a unique kennziffer/code (chromium and Mobile
// Safari run in parallel) and removed in afterEach; tests/global-teardown.ts sweeps the rest by
// email domain / tenant prefix.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let createdArticles: string[] = []
let createdMerkmale: { table: string; id: string }[] = []
let createdTenants: string[] = []
let createdUsers: string[] = []
let createdRoles: string[] = []

test.afterEach(async () => {
  for (const id of createdArticles) {
    await admin.from("edit_locks").delete().eq("resource_id", id)
    await admin.from("articles").delete().eq("id", id)
  }
  for (const { table, id } of createdMerkmale) await admin.from(table).delete().eq("id", id)
  for (const id of createdRoles) await admin.from("roles").delete().eq("id", id)
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id)
  for (const id of createdTenants) await admin.from("tenants").delete().eq("id", id)
  createdArticles = []
  createdMerkmale = []
  createdTenants = []
  createdUsers = []
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

async function baseArticleId(tenant: string, code = P3_BASE_CODE) {
  const { data, error } = await admin
    .from("base_articles")
    .select("id")
    .eq("tenant_id", tenant)
    .eq("code", code)
    .single()
  if (error) throw error
  return data.id as string
}

async function merkmalId(table: string, tenant: string, code: string) {
  const { data, error } = await admin.from(table).select("id").eq("tenant_id", tenant).eq("code", code).single()
  if (error) throw error
  return data.id as string
}

/** Free 4-digit kennziffer for the main tenant's base article 1200 (retries on collisions). */
async function mkArticle(
  tenant: string,
  base: string,
  extra: Record<string, unknown> = {},
  kennziffer?: string
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const k = kennziffer ?? String(1000 + Math.floor(Math.random() * 9000))
    const { data, error } = await admin
      .from("articles")
      .insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, base_article_id: base, kennziffer: k, ...extra })
      .select("id, article_number, kennziffer")
      .single()
    if (!error) {
      createdArticles.push(data.id)
      return { id: data.id as string, number: data.article_number as string, kennziffer: data.kennziffer as string }
    }
    if (error.code !== "23505" || kennziffer) throw error
  }
  throw new Error("no free kennziffer")
}

async function randomFreeKennziffer(tenant: string, base: string) {
  for (;;) {
    const k = String(1000 + Math.floor(Math.random() * 9000))
    const { data } = await admin
      .from("articles")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("base_article_number", P3_BASE_CODE)
      .eq("kennziffer", k)
    if (!data || data.length === 0) return k
  }
}

// Retries: when the button is clicked before React has hydrated (slow dev server, WebKit), the form
// is submitted natively and the page reloads on /login.
async function login(page: Page, username: string, password = P3_PASSWORD) {
  for (let attempt = 1; ; attempt++) {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(username)
    await page.getByLabel("Passwort").fill(password)
    await page.getByRole("button", { name: "Anmelden" }).click()
    try {
      await expect(page).toHaveURL("/", { timeout: 8000 })
      return
    } catch (error) {
      if (attempt >= 3) throw error
    }
  }
}

/** Second, independent browser session (cookies are per context). */
async function otherSession(browser: Browser, testInfo: TestInfo, username: string) {
  const baseURL = testInfo.project.use.baseURL
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await login(page, username)
  return { context, page }
}

/** Opens a tab (Reiter) of the article form; all tabs stay mounted but only the selected one is visible. */
async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click()
}

// Locates a Merkmal select via its visible label (the "Known bugs" test below asserts that the
// accessible name works too, so `getByRole("combobox", { name })` is equivalent).
function combo(page: Page, label: string) {
  return page.locator("label", { hasText: label }).locator("xpath=..").getByRole("combobox")
}

async function pick(page: Page, label: string, option: string | RegExp) {
  await combo(page, label).click()
  await page.getByRole("option", { name: option }).click()
}

async function openUserMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /Benutzermenü für/ })
  if (!(await trigger.isVisible())) {
    // Mobile: the sidebar is a sheet behind the header toggle.
    await page.getByRole("button", { name: "Navigation ein-/ausblenden" }).click()
  }
  await trigger.click()
}

async function userClient(username: string) {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: `${username}@${P3_EMAIL_DOMAIN}`,
    password: P3_PASSWORD,
  })
  if (error) throw error
  return client
}

async function mkTenantWithUser(testInfo: TestInfo, perms: [string, "read" | "write"][]) {
  const id = uid(testInfo)
  const { data: tenant } = await admin.from("tenants").insert({ name: `${P3_TENANT_PREFIX}${id}` }).select("id").single()
  createdTenants.push(tenant!.id)
  const { data: role } = await admin.from("roles").insert({ tenant_id: tenant!.id, name: "R" }).select("id").single()
  createdRoles.push(role!.id)
  await admin.from("role_permissions").insert(
    perms.map(([maske, access_level]) => ({ role_id: role!.id, module: "warenwirtschaft", maske, access_level }))
  )
  const username = `p3${id}`
  const email = `${username}@${P3_EMAIL_DOMAIN}`
  const { data: user } = await admin.auth.admin.createUser({ email, password: P3_PASSWORD, email_confirm: true })
  createdUsers.push(user.user!.id)
  await admin.from("user_profiles").insert({ id: user.user!.id, username, email })
  await admin.from("user_tenant_access").insert({ user_id: user.user!.id, tenant_id: tenant!.id })
  await admin.from("user_roles").insert({ user_id: user.user!.id, tenant_id: tenant!.id, role_id: role!.id })
  return { tenant: tenant!.id as string, username }
}

/** Own Einkauf user in the main tenant (for tests that log out: signOut ends ALL sessions of a user). */
async function mkEinkaufUser(testInfo: TestInfo) {
  const tenant = await tenantId(P3_TENANT)
  const { data: role } = await admin.from("roles").select("id").eq("tenant_id", tenant).eq("name", "Einkauf").single()
  const username = `p3e${uid(testInfo)}`
  const email = `${username}@${P3_EMAIL_DOMAIN}`
  const { data: user } = await admin.auth.admin.createUser({ email, password: P3_PASSWORD, email_confirm: true })
  createdUsers.push(user.user!.id)
  await admin.from("user_profiles").insert({ id: user.user!.id, username, email })
  await admin.from("user_tenant_access").insert({ user_id: user.user!.id, tenant_id: tenant })
  await admin.from("user_roles").insert({ user_id: user.user!.id, tenant_id: tenant, role_id: role!.id })
  return username
}

function articleUrl(tenant: string, id: string) {
  return `/artikelstamm/${id}?mandant=${tenant}`
}

test.describe("PROJ-3: Warenwirtschaft – Artikelstamm", () => {
  test("AC-1: a user with write access creates an article; the article number is composed automatically", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    const kennziffer = await randomFreeKennziffer(tenant, base)

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await page.getByLabel("Artikelbezeichnung").fill("E2E Vollmilch")
    // live preview before saving
    await expect(page.getByLabel("Artikelnummer", { exact: true })).toHaveText(`${P3_BASE_CODE}.${kennziffer}`)

    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(new RegExp(`/artikelstamm/[0-9a-f-]{36}\\?mandant=${tenant}`))
    await expect(page.getByRole("heading", { name: `${P3_BASE_CODE}.${kennziffer}` })).toBeVisible()

    const { data } = await admin
      .from("articles")
      .select("id, article_number, name, is_active, commodity_group")
      .eq("tenant_id", tenant)
      .eq("kennziffer", kennziffer)
      .eq("base_article_number", P3_BASE_CODE)
      .single()
    createdArticles.push(data!.id)
    expect(data).toMatchObject({ article_number: `${P3_BASE_CODE}.${kennziffer}`, name: "E2E Vollmilch", is_active: true })
    expect(data!.commodity_group).toBe("000")
  })

  test("AC-2: saving an article number that already exists is rejected with 'Artikelnummer bereits vergeben'", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    const existing = await mkArticle(tenant, base)

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelkennziffer").fill(existing.kennziffer)
    await page.getByRole("button", { name: "Speichern" }).click()

    await expect(page.getByText("Artikelnummer bereits vergeben")).toBeVisible()
    await expect(page).toHaveURL(/\/artikelstamm\/neu/)
    const { count } = await admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant)
      .eq("article_number", existing.number)
    expect(count).toBe(1)
  })

  test("AC-3: a kennziffer that is not exactly 4 digits shows a validation error and is not saved", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const marker = `E2E AC3 ${uid(testInfo)}`

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelbezeichnung").fill(marker)
    for (const value of ["", "123", "12a4"]) {
      await page.getByLabel("Artikelkennziffer").fill(value)
      await page.getByRole("button", { name: "Speichern" }).click()
      await expect(page.getByText("Die Artikelkennziffer muss genau 4 Ziffern haben")).toBeVisible()
    }
    const { count } = await admin.from("articles").select("id", { count: "exact", head: true }).eq("name", marker)
    expect(count).toBe(0)

    // Without a base article the form is rejected as well
    await page.reload()
    await page.getByLabel("Artikelkennziffer").fill("0001")
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByText("Die Basisartikelnummer muss aus 1 bis 10 Ziffern bestehen")).toBeVisible()
  })

  test("AC-4: a read-only user (Lager) is offered no edit option, no new-article button and cannot write via the API", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Lesen" })

    await login(page, P3_LAGER)
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    await expect(page.getByRole("link", { name: article.number })).toBeVisible()
    await expect(page.getByRole("link", { name: "Neuer Artikel" })).toHaveCount(0)

    await page.goto(articleUrl(tenant, article.id))
    await expect(page.getByRole("heading", { name: article.number })).toBeVisible()
    await expect(page.getByText("Nur Lesezugriff")).toBeVisible()
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Deaktivieren" })).toHaveCount(0)
    await expect(page.getByLabel("Artikelbezeichnung")).toBeDisabled()

    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await expect(page.getByText("Kein Zugriff")).toBeVisible()

    // the same session cannot write directly either
    const base = await baseArticleId(tenant)
    const post = await page.request.post(`/api/tenants/${tenant}/articles`, { data: { baseArticleNumber: P3_BASE_CODE, kennziffer: "4321" } })
    expect(post.status()).toBe(403)
    const patch = await page.request.patch(`/api/tenants/${tenant}/articles/${article.id}/status`, { data: { isActive: false } })
    expect(patch.status()).toBe(403)
    const lock = await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "article", resourceId: article.id } })
    expect(lock.status()).toBe(403)
  })

  test("AC-5: while user A edits, user B is told who is editing and only gets read access", async ({ page, browser }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Sperre" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await expect(page.getByRole("button", { name: "Speichern" })).toBeVisible()

    const b = await otherSession(browser, testInfo, P3_EINKAUF2)
    try {
      await b.page.goto(articleUrl(tenant, article.id))
      // the banner names the editing user before B even tries
      await expect(b.page.getByText("Gesperrt – nur Lesezugriff")).toBeVisible()
      await expect(b.page.getByText(P3_EINKAUF, { exact: false }).first()).toBeVisible()

      await b.page.getByRole("button", { name: "Bearbeiten" }).click()
      await expect(b.page.getByText("Bearbeiten nicht möglich")).toBeVisible()
      await expect(b.page.getByRole("button", { name: "Speichern" })).toHaveCount(0)
      await expect(b.page.getByLabel("Artikelbezeichnung")).toBeDisabled()

      // B cannot save by calling the API either — the error names A
      const base = await baseArticleId(tenant)
      const res = await b.page.request.patch(`/api/tenants/${tenant}/articles/${article.id}`, {
        data: { baseArticleNumber: P3_BASE_CODE, kennziffer: article.kennziffer, name: "Fremd" },
      })
      expect(res.status()).toBe(409)
      expect((await res.json()).error).toContain(P3_EINKAUF)
    } finally {
      await b.context.close()
    }

    // A cancels → lock released → B can edit
    await page.getByRole("button", { name: "Abbrechen" }).click()
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data?.length).toBe(0)
  })

  test("AC-6: after 15 minutes without activity the editing lock is released automatically", async ({ page, browser }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Timeout" })

    await page.clock.install()
    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await expect(page.getByRole("button", { name: "Speichern" })).toBeVisible()
    await page.getByLabel("Artikelbezeichnung").fill("Ungespeicherte Änderung")
    expect((await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data).toHaveLength(1)

    // 14 min idle: still held, warning shown; 16 min: released
    await page.clock.fastForward("14:00")
    await expect(page.getByText("Sperre läuft bald ab")).toBeVisible()
    // let the heartbeat that this tick sends settle (see "Observations" in the QA notes: a release can
    // race with an in-flight renewal and re-create the lock)
    await page.waitForTimeout(1500)
    await page.clock.fastForward("02:00")
    await expect(page.getByText("Bearbeitungssperre abgelaufen")).toBeVisible()
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data?.length).toBe(0)

    // inputs stay, but cannot be saved without re-locking
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("Ungespeicherte Änderung")
    await expect(page.getByLabel("Artikelbezeichnung")).toBeDisabled()
    await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled()

    // meanwhile somebody else takes the lock (B's session stays open: closing it would release the lock)
    const b = await otherSession(browser, testInfo, P3_EINKAUF2)
    try {
      await b.page.goto(articleUrl(tenant, article.id))
      await b.page.getByRole("button", { name: "Bearbeiten" }).click()
      await expect(b.page.getByRole("button", { name: "Speichern" })).toBeVisible()

      // …so A re-locking is refused and the message names B
      await page.getByRole("button", { name: "Erneut sperren" }).click()
      await expect(page.getByText(P3_EINKAUF2).first()).toBeVisible()
      await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled()
    } finally {
      await b.context.close()
    }
  })

  test("AC-7: logging out with unsaved changes asks to save or discard", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Logout" })

    await login(page, await mkEinkaufUser(testInfo))
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await page.getByLabel("Artikelbezeichnung").fill("E2E Logout geändert")

    // Cancel keeps the user logged in and the edit state untouched
    await openUserMenu(page)
    await page.getByRole("menuitem", { name: "Abmelden" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByText("Ungespeicherte Änderungen")).toBeVisible()
    await dialog.getByRole("button", { name: "Abbrechen" }).click()
    await expect(page).toHaveURL(new RegExp(`/artikelstamm/${article.id}`))
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("E2E Logout geändert")

    // Discard: logged out, nothing saved, lock released
    await openUserMenu(page)
    await page.getByRole("menuitem", { name: "Abmelden" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Verwerfen & abmelden" }).click()
    await expect(page).toHaveURL(/\/login/)
    const { data } = await admin.from("articles").select("name").eq("id", article.id).single()
    expect(data!.name).toBe("E2E Logout")
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data?.length).toBe(0)
  })

  test("AC-7b: 'Speichern & abmelden' saves the changes first", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Logout Save" })

    await login(page, await mkEinkaufUser(testInfo))
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await page.getByLabel("Artikelbezeichnung").fill("E2E gespeichert beim Logout")
    await openUserMenu(page)
    await page.getByRole("menuitem", { name: "Abmelden" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Speichern & abmelden" }).click()
    await expect(page).toHaveURL(/\/login/)
    const { data } = await admin.from("articles").select("name").eq("id", article.id).single()
    expect(data!.name).toBe("E2E gespeichert beim Logout")
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data?.length).toBe(0)
  })

  test("AC-8: there is no delete — only 'Deaktivieren', which keeps the record", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Deaktivieren" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await expect(page.getByRole("button", { name: /lösch/i })).toHaveCount(0)
    await page.getByRole("button", { name: "Deaktivieren" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Deaktivieren" }).click()
    await expect(page.getByText("Inaktiv").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Aktivieren" })).toBeVisible()
    const { data } = await admin.from("articles").select("is_active").eq("id", article.id).single()
    expect(data!.is_active).toBe(false)

    // direct REST delete (own session token) removes nothing; there is no DELETE route either
    const client = await userClient(P3_EINKAUF)
    const del = await client.from("articles").delete().eq("id", article.id).select("id")
    expect(del.data ?? []).toHaveLength(0)
    expect((await admin.from("articles").select("id").eq("id", article.id)).data).toHaveLength(1)
    const route = await page.request.delete(`/api/tenants/${tenant}/articles/${article.id}`)
    expect(route.status(), await route.text()).toBe(405)
  })

  test("AC-9: a deactivated article stays in the list with a status and can be hidden with the 'Aktiv' filter", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    const inactive = await mkArticle(tenant, base, { name: "E2E Inaktiv Filter", is_active: false })
    const active = await mkArticle(tenant, base, { name: "E2E Aktiv Filter" })

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm?mandant=${tenant}&q=E2E+Inaktiv+Filter`)
    await expect(page.getByRole("link", { name: inactive.number })).toBeVisible()
    await page.goto(`/artikelstamm?mandant=${tenant}&q=Filter&status=aktiv`)
    await expect(page.getByRole("link", { name: active.number })).toBeVisible()
    await expect(page.getByRole("link", { name: inactive.number })).toHaveCount(0)
    // NOTE: "not offered in selection lists of other masks" is only verifiable once such masks
    // exist (PROJ-5/6/7); the data layer (is_active) and the list filter are covered here.
  })

  test("AC-10: an empty Merkmal table shows 'Noch keine Einträge – hier anlegen' with a link to its maintenance mask", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT_LEER)
    await login(page, P3_LEER)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await combo(page, "Basisartikel").click()
    await expect(page.getByText("Noch keine Einträge")).toBeVisible()
    const link = page.getByRole("link", { name: /hier anlegen/ })
    await expect(link).toHaveAttribute("href", `/merkmale/basisartikel?mandant=${tenant}`)
  })

  test("AC-11: users only see articles and Merkmale of their own tenant", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const foreign = await tenantId(P3_TENANT_FREMD)
    const mine = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Mandant Eigen" })
    const { data: foreignBase } = await admin
      .from("base_articles")
      .insert({ tenant_id: foreign, code: `F${Date.now().toString(36).slice(-6)}`, name: "Fremd-Basis" })
      .select("id")
      .single()
    createdMerkmale.push({ table: "base_articles", id: foreignBase!.id })
    const theirs = await mkArticle(foreign, foreignBase!.id, { name: "E2E Mandant Fremd" })

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    await expect(page.getByRole("link", { name: mine.number })).toBeVisible()
    await expect(page.getByText("E2E Mandant Fremd")).toHaveCount(0)

    // asking for the foreign tenant falls back to the own tenant; the foreign article is not reachable
    await page.goto(`/artikelstamm?mandant=${foreign}`)
    await expect(page.getByText("E2E Mandant Fremd")).toHaveCount(0)
    await page.goto(articleUrl(foreign, theirs.id))
    await expect(page.getByText("Artikel nicht gefunden")).toBeVisible()
    await page.goto(`/merkmale/basisartikel?mandant=${foreign}`)
    await expect(page.getByText("Fremd-Basis")).toHaveCount(0)

    // API against the foreign tenant is forbidden, direct REST shows no foreign rows
    const res = await page.request.post(`/api/tenants/${foreign}/articles`, {
      data: { baseArticleNumber: P3_BASE_CODE, baseArticleId: foreignBase!.id, kennziffer: "0001" },
    })
    expect(res.status()).toBe(403)
    const client = await userClient(P3_EINKAUF)
    const rest = await client.from("articles").select("id").eq("id", theirs.id)
    expect(rest.data ?? []).toHaveLength(0)
    const restBase = await client.from("base_articles").select("id").eq("id", foreignBase!.id)
    expect(restBase.data ?? []).toHaveLength(0)
  })

  test("AC-12: the label of a Merkmal field links to its maintenance mask", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)

    await openTab(page, "Klassifizierung")
    const link = page.getByRole("link", { name: /Basisartikel/ }).first()
    await expect(link).toHaveAttribute("href", `/merkmale/basisartikel?mandant=${tenant}`)
    const [popup] = await Promise.all([page.context().waitForEvent("page"), link.click()])
    await popup.waitForLoadState()
    await expect(popup).toHaveURL(new RegExp(`/merkmale/basisartikel\\?mandant=${tenant}`))
    await expect(popup.getByRole("heading", { name: "Basisartikel" })).toBeVisible()
    await expect(popup.getByText("Tafelschokolade")).toBeVisible()
    // the original form is untouched
    await expect(page).toHaveURL(/\/artikelstamm\/neu/)

    // a user without the maintenance mask gets a plain label (no link)
    // (Lager has no Artikelstamm write; use a tenant user who can create but not maintain)
    const { tenant: t, username } = await mkTenantWithUser(test.info(), [["artikelstamm", "write"]])
    await page.context().clearCookies()
    await login(page, username)
    await page.goto(`/artikelstamm/neu?mandant=${t}`)
    await openTab(page, "Klassifizierung")
    await expect(page.getByRole("link", { name: /Basisartikel/ })).toHaveCount(0)
  })

  test("Edge: calculated fields (Warengruppe, Bruttogewicht, Artikelnummer) update live and are stored by the server", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    const kennziffer = await randomFreeKennziffer(tenant, base)

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await expect(page.getByLabel("Warengruppe", { exact: true })).toHaveText("000")
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await pick(page, "Artikeltyp", /FW/)
    await openTab(page, "Klassifizierung")
    await pick(page, "Saison", /SOM/)
    // the Basisartikel Merkmal carries a customs tariff number that is prefilled
    await pick(page, "Basisartikel", /1200/)
    await openTab(page, "Steuern & Zoll")
    await expect(page.getByLabel("Zolltarifnummer")).toHaveValue("18063210")
    await openTab(page, "Kern & Identifikation")
    await expect(page.getByLabel("Warengruppe", { exact: true })).toHaveText("340")
    // Matchcode: Artikeltyp-Saison-Basisartikel
    await expect(page.getByLabel("Matchcode", { exact: true })).toHaveText(/^FW-SOM-/)
    // name suggestion from the Basisartikel name
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("Tafelschokolade")
    await openTab(page, "Verpackung & Logistik")
    await page.getByLabel(/^Gewicht/).fill("100,5")
    await page.getByLabel(/^Tara/).fill("10")
    await expect(page.getByLabel(/Bruttogewicht/)).toHaveText("110,5")
    await openTab(page, "Kern & Identifikation")
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(/\/artikelstamm\/[0-9a-f-]{36}/)

    const { data } = await admin
      .from("articles")
      .select("id, commodity_group, gross_weight")
      .eq("tenant_id", tenant)
      .eq("kennziffer", kennziffer)
      .eq("base_article_number", P3_BASE_CODE)
      .single()
    createdArticles.push(data!.id)
    expect(data!.commodity_group).toBe("340")
    expect(Number(data!.gross_weight)).toBe(110.5)
  })

  test("Edge: 'Mischartikel' reveals count and extra GTIN fields", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Verpackung & Logistik")
    await expect(page.getByLabel("GTIN Mischartikel 1")).toHaveCount(0)
    await page.getByLabel("Mischartikel", { exact: true }).click()
    await expect(page.getByLabel("GTIN Mischartikel 1")).toBeVisible()
    await expect(page.getByLabel("GTIN Mischartikel 2")).toBeVisible()
    await expect(page.getByLabel("Anzahl Mischartikel")).toBeVisible()
  })

  test("Edge: a network failure while saving keeps the inputs and shows an error", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    const kennziffer = await randomFreeKennziffer(tenant, base)

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await page.getByLabel("Artikelbezeichnung").fill("E2E Netzwerk")

    await page.route("**/api/tenants/*/articles", (route) => route.abort("failed"))
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByText("Verbindung zum Server fehlgeschlagen")).toBeVisible()
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("E2E Netzwerk")
    await expect(page.getByLabel("Artikelkennziffer")).toHaveValue(kennziffer)

    // retry after the network is back
    await page.unroute("**/api/tenants/*/articles")
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(/\/artikelstamm\/[0-9a-f-]{36}/)
    const { data } = await admin.from("articles").select("id").eq("tenant_id", tenant).eq("kennziffer", kennziffer).eq("base_article_number", P3_BASE_CODE).single()
    createdArticles.push(data!.id)
  })

  test("Edge: editing and saving an existing article persists the change and releases the lock", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Vorher" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await page.getByLabel("Artikelbezeichnung").fill("E2E Nachher")
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("E2E Nachher")
    const { data } = await admin.from("articles").select("name, updated_by").eq("id", article.id).single()
    expect(data!.name).toBe("E2E Nachher")
    expect(data!.updated_by).not.toBeNull()
    expect((await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data).toHaveLength(0)
  })

  test("Edge: cancelling with changes asks for confirmation and releases the lock", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Abbruch" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await page.getByLabel("Artikelbezeichnung").fill("E2E Abbruch geändert")
    await page.getByRole("button", { name: "Abbrechen" }).click()
    await expect(page.getByRole("alertdialog").getByText("Änderungen verwerfen?")).toBeVisible()
    await page.getByRole("alertdialog").getByRole("button", { name: "Verwerfen" }).click()
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("E2E Abbruch")
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data?.length).toBe(0)
  })

  test("Edge: if the lock was lost on the server while editing, saving shows a lock error (not a field error) and keeps the inputs", async ({ page }) => {
    // BUG-2 (open): the lock error is attached to the Artikelkennziffer field. Remove test.fail() once fixed.
    test.fail()
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Sperre weg" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await page.getByLabel("Artikelbezeichnung").fill("E2E Sperre weg geändert")
    // the lock disappears behind the client's back (e.g. expired while the tab slept)
    await admin.from("edit_locks").delete().eq("resource_id", article.id)
    await page.getByRole("button", { name: "Speichern" }).click()

    await expect(page.getByText(/Bearbeitungssperre ist abgelaufen/)).toBeVisible()
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("E2E Sperre weg geändert")
    // the message belongs to the form, not to the Artikelkennziffer field
    const kennzifferItem = page.getByLabel("Artikelkennziffer").locator("xpath=ancestor::div[contains(@class,'space-y-2')][1]")
    await expect(kennzifferItem.getByText(/Bearbeitungssperre/)).toHaveCount(0)
    const { data } = await admin.from("articles").select("name").eq("id", article.id).single()
    expect(data!.name).toBe("E2E Sperre weg")
  })

  test("Edge: leaving the page releases the lock", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: "E2E Verlassen" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await expect(page.getByRole("button", { name: "Speichern" })).toBeVisible()
    expect((await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data).toHaveLength(1)
    await page.goto("/profil")
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data?.length).toBe(0)
  })

  test("Edge: list search, type filter and pagination", async ({ page }, testInfo) => {
    const { tenant, username } = await mkTenantWithUser(testInfo, [["artikelstamm", "write"]])
    const id = uid(testInfo)
    const { data: base } = await admin.from("base_articles").insert({ tenant_id: tenant, code: "9", name: "B" }).select("id").single()
    const { data: type } = await admin
      .from("article_types")
      .insert({ tenant_id: tenant, code: "T1", name: "Typ Eins", commodity_digit: 1 })
      .select("id")
      .single()
    const rows = Array.from({ length: 27 }, (_, i) => ({
      tenant_id: tenant,
      base_article_number: "9",
      base_article_id: base!.id,
      kennziffer: String(1000 + i),
      name: i === 0 ? `Besonders ${id}` : `Artikel ${i}`,
      article_type_id: i === 1 ? type!.id : null,
    }))
    await admin.from("articles").insert(rows)

    await login(page, username)
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    await expect(page.getByText("Seite 1 von 2 · 27 Artikel")).toBeVisible()
    await page.getByRole("link", { name: "Weiter" }).click()
    await expect(page.getByText("Seite 2 von 2")).toBeVisible()
    await expect(page.getByRole("row")).toHaveCount(3) // header + 2 articles

    // live search by name, then by number
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    await page.getByLabel("Suche").fill(`Besonders ${id}`)
    await expect(page.getByRole("link", { name: "9.1000" })).toBeVisible()
    await expect(page.getByRole("row")).toHaveCount(2)
    await page.getByLabel("Suche").fill("9.1001")
    await expect(page.getByRole("link", { name: "9.1001" })).toBeVisible()
    await expect(page.getByRole("row")).toHaveCount(2)

    // type filter
    await page.goto(`/artikelstamm?mandant=${tenant}&typ=${type!.id}`)
    await expect(page.getByRole("link", { name: "9.1001" })).toBeVisible()
    await expect(page.getByRole("row")).toHaveCount(2)
    await page.goto(`/artikelstamm?mandant=${tenant}&q=gibt-es-nicht`)
    await expect(page.getByText("Keine Artikel gefunden")).toBeVisible()
  })
})

test.describe("PROJ-3: Merkmal-Tabellen", () => {
  test("a user with write access creates, edits and deactivates a Merkmal entry; duplicates are rejected", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const code = `W${uid(testInfo).slice(-6)}`.toUpperCase()

    await login(page, P3_EINKAUF)
    await page.goto(`/merkmale/saisons?mandant=${tenant}`)
    await expect(page.getByRole("cell", { name: "SOM", exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Kürzel").fill(code)
    const label = `Winter ${code}`
    await dialog.getByLabel("Bezeichnung").fill(label)
    await dialog.getByLabel("Warengruppen-Ziffer").fill("12") // maxLength 1 → "1"
    await expect(dialog.getByLabel("Warengruppen-Ziffer")).toHaveValue("1")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(page.getByRole("cell", { name: code, exact: true })).toBeVisible()
    const id = await merkmalId("seasons", tenant, code)
    createdMerkmale.push({ table: "seasons", id })

    // duplicate (case-insensitive) is rejected on the Kürzel field
    await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
    await page.getByRole("dialog").getByLabel("Kürzel").fill(code.toLowerCase())
    await page.getByRole("dialog").getByLabel("Bezeichnung").fill("Doppelt")
    await page.getByRole("dialog").getByLabel("Warengruppen-Ziffer").fill("2")
    await page.getByRole("dialog").getByRole("button", { name: "Anlegen" }).click()
    await expect(page.getByRole("dialog").getByText(/bereits vergeben/)).toBeVisible()
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click()

    // edit
    await page.getByRole("button", { name: new RegExp(`${code}.* bearbeiten`) }).click()
    await page.getByRole("dialog").getByLabel("Bezeichnung").fill(`${label} neu`)
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByText(`${label} neu`, { exact: true })).toBeVisible()

    // deactivate (no delete available)
    await expect(page.getByRole("button", { name: /lösch/i })).toHaveCount(0)
    await page.getByRole("button", { name: new RegExp(`${code}.* deaktivieren`) }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Deaktivieren" }).click()
    await expect.poll(async () => (await admin.from("seasons").select("is_active").eq("id", id).single()).data?.is_active).toBe(false)
  })

  test("a deactivated Merkmal entry is not offered for new articles but stays visible on articles that use it", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const code = `I${uid(testInfo).slice(-6)}`.toUpperCase()
    const { data: season } = await admin
      .from("seasons")
      .insert({ tenant_id: tenant, code, name: "Inaktiv-Test", commodity_digit: 5, is_active: false })
      .select("id")
      .single()
    createdMerkmale.push({ table: "seasons", id: season!.id })
    // an article that already uses an (afterwards) deactivated season
    const { data: used } = await admin
      .from("seasons")
      .insert({ tenant_id: tenant, code: `U${code.slice(1)}`, name: "Genutzt", commodity_digit: 6 })
      .select("id")
      .single()
    createdMerkmale.push({ table: "seasons", id: used!.id })
    const article = await mkArticle(tenant, await baseArticleId(tenant), { season_id: used!.id })
    await admin.from("seasons").update({ is_active: false }).eq("id", used!.id)
    createdArticles.splice(createdArticles.indexOf(article.id), 1)
    createdArticles.unshift(article.id) // article is removed before its season in afterEach

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await combo(page, "Saison").click()
    await expect(page.getByRole("option", { name: /SOM/ })).toBeVisible()
    await expect(page.getByRole("option", { name: new RegExp(code) })).toHaveCount(0)
    await page.keyboard.press("Escape")

    await page.goto(articleUrl(tenant, article.id))
    await openTab(page, "Klassifizierung")
    await expect(combo(page, "Saison")).toContainText("(inaktiv)")
  })

  test("the maintenance mask requires its own right: Saison-only user sees Saisons, not Artikelstamm or other Merkmale", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_MERKMAL_ONLY)
    await page.goto(`/merkmale/saisons?mandant=${tenant}`)
    await expect(page.getByRole("cell", { name: "SOM", exact: true })).toBeVisible()
    await page.goto(`/merkmale/artikeltypen?mandant=${tenant}`)
    await expect(page.getByText("Kein Zugriff")).toBeVisible()
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    await expect(page.getByText("Kein Zugriff")).toBeVisible()
  })

  test("a user without any Warenwirtschaft mask gets 'Kein Zugriff' everywhere and no navigation entries", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_OHNE)
    for (const path of ["/artikelstamm", "/artikelstamm/neu", "/merkmale/saisons", "/merkmale/mehrwertsteuersaetze"]) {
      await page.goto(`${path}?mandant=${tenant}`)
      await expect(page.getByText("Kein Zugriff")).toBeVisible()
    }
    await page.goto("/merkmale/gibt-es-nicht")
    await expect(page.getByText(/404|nicht gefunden|could not be found/i).first()).toBeVisible()
  })

  test("a read-only Merkmal user cannot change entries (no actions, API 403)", async ({ page }, testInfo) => {
    const { tenant, username } = await mkTenantWithUser(testInfo, [["merkmal_saison", "read"]])
    const { data: season } = await admin
      .from("seasons")
      .insert({ tenant_id: tenant, code: "RO", name: "Nur lesen", commodity_digit: 2 })
      .select("id")
      .single()
    await login(page, username)
    await page.goto(`/merkmale/saisons?mandant=${tenant}`)
    await expect(page.getByRole("cell", { name: "Nur lesen" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Neuer Eintrag" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /bearbeiten/ })).toHaveCount(0)
    const res = await page.request.patch(`/api/tenants/${tenant}/merkmale/saisons/${season!.id}`, { data: { isActive: false } })
    expect(res.status()).toBe(403)
  })
})

test.describe("PROJ-3: Known bugs (see QA section in the spec)", () => {
  test("BUG-1 (fixed): Merkmal selects in the article form have an accessible name from their label", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await expect(page.getByRole("combobox", { name: /Basisartikel/ })).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole("combobox", { name: /Saison/ })).toBeVisible({ timeout: 3000 })
  })
})

test.describe("PROJ-3: Known bugs, part 2 (see QA section in the spec)", () => {
  test("BUG-4 (open): a lock cannot be created for a record that does not exist", async ({ page }) => {
    // Remove test.fail() once acquire_edit_lock validates the resource. Currently any writer can create
    // arbitrary lock rows (cleaned up only after one day, no rate limit).
    test.fail()
    const tenant = await tenantId(P3_TENANT)
    const ghost = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    await login(page, P3_EINKAUF)
    const res = await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "article", resourceId: ghost } })
    await admin.from("edit_locks").delete().eq("resource_id", ghost)
    expect([400, 404]).toContain(res.status())
  })
})

test.describe("PROJ-3: Rollen mit Zugriffsstufe (PROJ-2 Erweiterung)", () => {
  test("a tenant admin grants a role 'Lesen' on Artikelstamm; the user can view but not edit", async ({ page }, testInfo) => {
    const nord = await (async () => {
      const { data } = await admin.from("tenants").select("id").eq("name", P2_TENANT_NORD).single()
      return data!.id as string
    })()
    const name = `E2E-Stufe ${uid(testInfo)}`

    await login(page, P2_TENANT_ADMIN, P2_PASSWORD)
    await page.goto(`/benutzerverwaltung?mandant=${nord}`)
    await page.getByRole("tab", { name: /Rollen/ }).click()
    await page.getByRole("button", { name: "Neue Rolle" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name").fill(name)
    await dialog.getByRole("combobox", { name: "Artikelstamm" }).click()
    await page.getByRole("option", { name: "Lesen", exact: true }).click()
    await dialog.getByRole("combobox", { name: "Saisons" }).click()
    await page.getByRole("option", { name: "Lesen + Bearbeiten" }).click()
    await dialog.getByRole("button", { name: "Rolle anlegen" }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible()

    const { data: role } = await admin.from("roles").select("id").eq("tenant_id", nord).eq("name", name).single()
    createdRoles.push(role!.id)
    const { data: perms } = await admin.from("role_permissions").select("maske, access_level").eq("role_id", role!.id)
    expect(Object.fromEntries((perms ?? []).map((p) => [p.maske, p.access_level]))).toEqual({
      artikelstamm: "read",
      merkmal_saison: "write",
    })

    // the role list names the levels
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("Artikelstamm")

    // editing the role: change Artikelstamm to 'Lesen + Bearbeiten' (only the level changes)
    await page.getByRole("button", { name: `Rolle ${name} bearbeiten` }).click()
    await page.getByRole("dialog").getByRole("combobox", { name: "Artikelstamm" }).click()
    await page.getByRole("option", { name: "Lesen + Bearbeiten" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click()
    await expect.poll(async () => {
      const { data } = await admin.from("role_permissions").select("access_level").eq("role_id", role!.id).eq("maske", "artikelstamm")
      return data?.map((p) => p.access_level)
    }).toEqual(["write"])
  })

  test("existing PROJ-2 admin rights keep working: the Benutzerverwaltung mask offers only 'Kein Zugriff / Zugriff'", async ({ page }) => {
    const nord = (await admin.from("tenants").select("id").eq("name", P2_TENANT_NORD).single()).data!.id as string
    await login(page, P2_TENANT_ADMIN, P2_PASSWORD)
    await page.goto(`/benutzerverwaltung?mandant=${nord}`)
    await page.getByRole("tab", { name: /Rollen/ }).click()
    await page.getByRole("button", { name: "Neue Rolle" }).click()
    await page.getByRole("dialog").getByRole("combobox", { name: "Benutzerverwaltung" }).click()
    await expect(page.getByRole("option", { name: "Zugriff", exact: true })).toBeVisible()
    await expect(page.getByRole("option", { name: "Lesen", exact: true })).toHaveCount(0)
  })
})

test.describe("PROJ-3: Security", () => {
  test("unauthenticated requests are rejected (401) and pages redirect to the login", async ({ page, request }) => {
    const tenant = await tenantId(P3_TENANT)
    const id = "11111111-1111-4111-8111-111111111111"
    for (const [method, path, data] of [
      ["post", `/api/tenants/${tenant}/articles`, { baseArticleNumber: P3_BASE_CODE, kennziffer: "0001" }],
      ["patch", `/api/tenants/${tenant}/articles/${id}`, { baseArticleNumber: P3_BASE_CODE, kennziffer: "0001" }],
      ["patch", `/api/tenants/${tenant}/articles/${id}/status`, { isActive: false }],
      ["post", `/api/tenants/${tenant}/merkmale/saisons`, { code: "X", name: "x", commodityDigit: 1 }],
      ["patch", `/api/tenants/${tenant}/merkmale/saisons/${id}`, { isActive: false }],
      ["post", `/api/tenants/${tenant}/locks`, { resourceType: "article", resourceId: id }],
      ["delete", `/api/tenants/${tenant}/locks?resourceType=article&resourceId=${id}`, undefined],
    ] as const) {
      const res = await request[method](path, { data, maxRedirects: 0 })
      expect(res.status(), `${method} ${path}`).toBe(401)
    }
    for (const path of ["/artikelstamm", `/artikelstamm/${id}`, "/artikelstamm/neu", "/merkmale/saisons"]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test("direct database access (PostgREST with a user token) honours rights, tenants and locks", async () => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    const article = await mkArticle(tenant, base, { name: "E2E RLS" })
    const lager = await userClient(P3_LAGER)
    const einkauf = await userClient(P3_EINKAUF)
    const einkauf2 = await userClient(P3_EINKAUF2)
    const fremd = await userClient(P3_FREMD)
    const ohne = await userClient(P3_OHNE)

    // reading
    expect((await lager.from("articles").select("id").eq("id", article.id)).data).toHaveLength(1)
    expect((await lager.from("seasons").select("id").eq("tenant_id", tenant)).data!.length).toBeGreaterThan(0)
    expect((await ohne.from("articles").select("id").eq("id", article.id)).data).toHaveLength(0)
    expect((await ohne.from("seasons").select("id").eq("tenant_id", tenant)).data).toHaveLength(0)
    expect((await fremd.from("articles").select("id").eq("id", article.id)).data).toHaveLength(0)

    // writing without rights
    const k = await randomFreeKennziffer(tenant, base)
    expect((await lager.from("articles").insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, base_article_id: base, kennziffer: k })).error).not.toBeNull()
    expect((await fremd.from("articles").insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, base_article_id: base, kennziffer: k })).error).not.toBeNull()
    expect((await lager.from("articles").update({ name: "Hack" }).eq("id", article.id).select("id")).data ?? []).toHaveLength(0)
    expect((await lager.from("seasons").insert({ tenant_id: tenant, code: "HACK", name: "x", commodity_digit: 1 })).error).not.toBeNull()
    expect((await lager.from("role_permissions").update({ access_level: "write" }).eq("access_level", "read").select("id")).data ?? []).toHaveLength(0)

    // moving an article into another tenant / spoofing computed + audit columns
    const move = await einkauf.from("articles").update({ tenant_id: await tenantId(P3_TENANT_FREMD) }).eq("id", article.id).select("id")
    expect(move.error !== null || (move.data ?? []).length === 0).toBe(true)

    // locks: tables are closed, functions check rights, foreign locks block writes
    expect((await einkauf.from("edit_locks").select("id")).data ?? []).toHaveLength(0)
    expect((await einkauf.from("edit_locks").insert({ tenant_id: tenant, resource_type: "article", resource_id: article.id, user_id: "00000000-0000-0000-0000-000000000000", expires_at: new Date(Date.now() + 3600e3).toISOString() })).error).not.toBeNull()
    expect((await lager.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "article", p_resource_id: article.id })).error).not.toBeNull()
    expect((await fremd.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "article", p_resource_id: article.id })).error).not.toBeNull()
    const got = await einkauf.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "article", p_resource_id: article.id })
    expect(got.data![0].out_acquired).toBe(true)
    const other = await einkauf2.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "article", p_resource_id: article.id })
    expect(other.data![0]).toMatchObject({ out_acquired: false, out_holder_username: P3_EINKAUF })
    // B cannot release A's lock, cannot write
    await einkauf2.rpc("release_edit_lock", { p_tenant_id: tenant, p_resource_type: "article", p_resource_id: article.id })
    expect((await admin.from("edit_locks").select("id").eq("resource_id", article.id)).data).toHaveLength(1)
    const blocked = await einkauf2.from("articles").update({ name: "B darf nicht" }).eq("id", article.id).select("id")
    expect(blocked.error?.code).toBe("55P03")
    // A may write; client-supplied computed columns are overwritten
    const ok = await einkauf
      .from("articles")
      .update({ name: "A darf", article_number: "FAKE", commodity_group: "999", gross_weight: 1, created_by: null })
      .eq("id", article.id)
      .select("article_number, commodity_group, gross_weight")
    expect(ok.error).toBeNull()
    expect(ok.data![0].article_number).toBe(article.number)
    expect(ok.data![0].commodity_group).toBe("000")
    expect(ok.data![0].gross_weight).toBeNull()
    // hard delete is impossible for everybody
    expect((await einkauf.from("articles").delete().eq("id", article.id).select("id")).data ?? []).toHaveLength(0)
    expect((await einkauf.from("seasons").delete().eq("tenant_id", tenant).select("id")).data ?? []).toHaveLength(0)
  })

  test("a Merkmal reference to another tenant or to a deactivated entry is refused by the database", async () => {
    const tenant = await tenantId(P3_TENANT)
    const foreign = await tenantId(P3_TENANT_FREMD)
    const base = await baseArticleId(tenant)
    const einkauf = await userClient(P3_EINKAUF)
    const { data: foreignSeason } = await admin
      .from("seasons")
      .insert({ tenant_id: foreign, code: `FS${Date.now().toString(36).slice(-5)}`, name: "Fremd", commodity_digit: 1 })
      .select("id")
      .single()
    createdMerkmale.push({ table: "seasons", id: foreignSeason!.id })
    const k1 = await randomFreeKennziffer(tenant, base)
    const res = await einkauf.from("articles").insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, base_article_id: base, kennziffer: k1, season_id: foreignSeason!.id })
    expect(res.error?.code).toBe("23503")
  })

  test("XSS payloads in article fields are rendered as text, never executed", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`
    const article = await mkArticle(tenant, await baseArticleId(tenant), { name: payload, description: payload })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue(payload)
    await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent("<img src=x onerror=window.__xss=3>")}`)
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    await page.getByLabel("Suche").fill(payload)
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    // the list shows the name as text
    await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent("img src=x")}`)
    await expect(page.getByRole("cell", { name: payload })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })

  test("search input cannot break the query (SQL/PostgREST filter injection attempts)", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_EINKAUF)
    for (const q of [
      "'; drop table articles; --",
      "%",
      "_",
      "a,name.ilike.%",
      "x),(article_number.ilike.*",
      '"quoted"',
      "\\",
      "a".repeat(500),
    ]) {
      const res = await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent(q)}&typ=${encodeURIComponent(q)}&seite=${encodeURIComponent(q)}`)
      expect(res!.status(), q).toBeLessThan(500)
    }
    expect((await admin.from("articles").select("id", { head: true, count: "exact" })).error).toBeNull()
    // an injected "or" must not leak other rows: a nonsense search returns nothing
    await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent("x),(is_active.eq.true")}`)
    await expect(page.getByText("Keine Artikel gefunden")).toBeVisible()
  })

  test("API input validation: wrong types, oversized and mass-assignment payloads are rejected or ignored", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const base = await baseArticleId(tenant)
    await login(page, P3_EINKAUF)
    const post = (data: unknown) => page.request.post(`/api/tenants/${tenant}/articles`, { data })

    expect((await post({ baseArticleNumber: P3_BASE_CODE, kennziffer: 1234 })).status()).toBe(400)
    expect((await post({ baseArticleNumber: P3_BASE_CODE, kennziffer: "0001", weight: "heavy" })).status()).toBe(400)
    expect((await post({ baseArticleNumber: P3_BASE_CODE, kennziffer: "0001", name: "x".repeat(201) })).status()).toBe(400)
    expect((await post({ baseArticleNumber: P3_BASE_CODE, kennziffer: "0001", description: "x".repeat(2001) })).status()).toBe(400)
    expect((await post({ baseArticleNumber: P3_BASE_CODE, kennziffer: "0001", gtinMain: "1".repeat(15) })).status()).toBe(400)
    expect((await post({ baseArticleNumber: P3_BASE_CODE, kennziffer: "0001", seasonId: "not-a-uuid" })).status()).toBe(400)
    expect((await post("not json")).status()).toBe(400)
    const text = await page.request.post(`/api/tenants/${tenant}/articles`, { headers: { "Content-Type": "application/json" }, data: "{broken" })
    expect(text.status()).toBe(400)
    const bad = await page.request.post(`/api/tenants/not-a-uuid/articles`, { data: { baseArticleNumber: P3_BASE_CODE, kennziffer: "0001" } })
    expect(bad.status()).toBe(404)

    // mass assignment: tenant_id / created_by / computed fields in the body are ignored
    const kennziffer = await randomFreeKennziffer(tenant, base)
    const foreign = await tenantId(P3_TENANT_FREMD)
    const res = await post({ baseArticleNumber: P3_BASE_CODE, kennziffer, tenant_id: foreign, tenantId: foreign, articleNumber: "HACK", commodity_group: "999", is_active: false })
    expect(res.status()).toBe(201)
    const created = await res.json()
    createdArticles.push(created.id)
    const { data } = await admin.from("articles").select("tenant_id, article_number, commodity_group, is_active").eq("id", created.id).single()
    expect(data).toMatchObject({ tenant_id: tenant, article_number: `${P3_BASE_CODE}.${kennziffer}`, commodity_group: "000", is_active: true })

    // Merkmal validation
    const m = (d: unknown) => page.request.post(`/api/tenants/${tenant}/merkmale/saisons`, { data: d })
    expect((await m({ code: "A", name: "B", commodityDigit: 10 })).status()).toBe(400)
    expect((await m({ code: "A", name: "B", commodityDigit: "3" })).status()).toBe(400)
    expect((await m({ code: "", name: "B", commodityDigit: 3 })).status()).toBe(400)
    expect((await page.request.post(`/api/tenants/${tenant}/merkmale/does-not-exist`, { data: {} })).status()).toBe(404)
    expect((await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "nope", resourceId: created.id } })).status()).toBe(400)
  })

  test("responses leak no internals (database errors are generic) and set no secrets in the page", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_EINKAUF)
    const res = await page.request.post(`/api/tenants/${tenant}/articles`, { data: { baseArticleNumber: P3_BASE_CODE, baseArticleId: "11111111-1111-4111-8111-111111111111", kennziffer: "0001" } })
    const text = await res.text()
    expect(res.status()).toBe(400)
    expect(text).not.toMatch(/violates|constraint|pg_|postgres|stack|supabase|SELECT |INSERT /i)
    await page.goto(`/artikelstamm?mandant=${tenant}`)
    const html = await page.content()
    expect(html).not.toMatch(/service_role|SUPABASE_SERVICE|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI/)
  })

  test("lock endpoint cannot be abused across tenants: a writer of tenant A cannot lock in tenant B", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const foreign = await tenantId(P3_TENANT_FREMD)
    await login(page, P3_EINKAUF)
    const res = await page.request.post(`/api/tenants/${foreign}/locks`, {
      data: { resourceType: "article", resourceId: "11111111-1111-4111-8111-111111111111" },
    })
    expect(res.status()).toBe(403)
    const rel = await page.request.delete(`/api/tenants/${tenant}/locks?resourceType=article&resourceId=11111111-1111-4111-8111-111111111111`)
    expect(rel.status()).toBe(204) // idempotent no-op for non-existing locks
  })
})

test.describe("PROJ-3 Refinement 2026-10-07: Reiter, Matchcode, Bezeichnungs-Vorschlag, Palettenklasse", () => {
  test("the article form shows its sections as tabs; only the selected tab is visible and the header stays", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)

    const titles = ["Kern & Identifikation", "Klassifizierung", "Zertifizierungen", "Verpackung & Logistik", "Steuern & Zoll"]
    for (const title of titles) await expect(page.getByRole("tab", { name: title })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Kern & Identifikation" })).toHaveAttribute("aria-selected", "true")

    await expect(page.getByLabel("Basisartikelnummer")).toBeVisible()
    await expect(page.getByLabel("Fairtrade")).toBeHidden()
    await openTab(page, "Zertifizierungen")
    await expect(page.getByLabel("Fairtrade")).toBeVisible()
    await expect(page.getByLabel("Basisartikelnummer")).toBeHidden()
    await expect(page.getByRole("heading", { name: "Neuer Artikel" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Speichern" })).toBeVisible()
  })

  test("a validation error marks its tab and jumps to it; nothing is saved", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const kennziffer = await randomFreeKennziffer(tenant, await baseArticleId(tenant))
    const marker = `E2E Reiter ${uid(testInfo)}`

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await page.getByLabel("Artikelbezeichnung").fill(marker)
    await openTab(page, "Verpackung & Logistik")
    await page.getByLabel("GTIN Hauptartikel").fill("abc")
    await page.getByRole("button", { name: "Speichern" }).click()

    await expect(page.getByText("GTIN Hauptartikel: nur Ziffern, höchstens 14 Stellen")).toBeVisible()
    await expect(page.getByRole("tab", { name: /Verpackung & Logistik.*enthält Fehler/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Kern & Identifikation.*enthält Fehler/ })).toHaveCount(0)

    // error in a hidden tab: submitting from another tab jumps to the first tab with an error
    await openTab(page, "Steuern & Zoll")
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByRole("tab", { name: /Verpackung & Logistik/ })).toHaveAttribute("aria-selected", "true")

    const { count } = await admin.from("articles").select("id", { count: "exact", head: true }).eq("name", marker)
    expect(count).toBe(0)
  })

  test("Matchcode: live preview from the Kürzel, stored by the server, shown in header and list, searchable", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const kennziffer = await randomFreeKennziffer(tenant, await baseArticleId(tenant))

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await expect(page.getByLabel("Matchcode", { exact: true })).toHaveText("–")
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await expect(page.getByLabel("Artikelnummer", { exact: true })).toHaveText(`${P3_BASE_CODE}.${kennziffer}`)
    await pick(page, "Artikeltyp", /FW/)
    await openTab(page, "Klassifizierung")
    await pick(page, "Saison", /SOM/)
    await pick(page, "Basisartikel", /1200/)
    await openTab(page, "Kern & Identifikation")
    await expect(page.getByLabel("Matchcode", { exact: true })).toHaveText("FW-SOM-1200")

    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(/\/artikelstamm\/[0-9a-f-]{36}/)
    await expect(page.getByText(/FW-SOM-1200 ·/)).toBeVisible()
    const { data } = await admin
      .from("articles")
      .select("id, match_code, article_number")
      .eq("tenant_id", tenant)
      .eq("kennziffer", kennziffer)
      .eq("base_article_number", P3_BASE_CODE)
      .single()
    createdArticles.push(data!.id)
    expect(data).toMatchObject({ match_code: "FW-SOM-1200", article_number: `${P3_BASE_CODE}.${kennziffer}` })

    await page.goto(`/artikelstamm?mandant=${tenant}&q=FW-SOM-1200`)
    await expect(page.getByRole("link", { name: `${P3_BASE_CODE}.${kennziffer}` })).toBeVisible()
  })

  test("Bezeichnungs-Vorschlag: filled from the Merkmal names, a manually changed name is never overwritten", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const id = uid(testInfo)
    const { data: form } = await admin
      .from("form_designs")
      .insert({ tenant_id: tenant, code: `F${id}`.slice(0, 20), name: `Hase${id}` })
      .select("id")
      .single()
    createdMerkmale.push({ table: "form_designs", id: form!.id })
    const { data: size } = await admin
      .from("pack_sizes")
      .insert({ tenant_id: tenant, code: `P${id}`.slice(0, 20), name: `Klein${id}` })
      .select("id")
      .single()
    createdMerkmale.push({ table: "pack_sizes", id: size!.id })
    const { data: size2 } = await admin
      .from("pack_sizes")
      .insert({ tenant_id: tenant, code: `G${id}`.slice(0, 20), name: `Gross${id}` })
      .select("id")
      .single()
    createdMerkmale.push({ table: "pack_sizes", id: size2!.id })

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await pick(page, "Basisartikel", /1200/)
    await pick(page, "Form/Design", new RegExp(`Hase${id}`))
    await openTab(page, "Kern & Identifikation")
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue(`Tafelschokolade Hase${id}`)

    // still the suggestion → follows further changes
    await openTab(page, "Klassifizierung")
    await pick(page, "Packungsgröße", new RegExp(`Klein${id}`))
    await openTab(page, "Kern & Identifikation")
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue(`Tafelschokolade Hase${id} Klein${id}`)

    // manual change → never overwritten again
    await page.getByLabel("Artikelbezeichnung").fill("Mein Verkaufsname")
    await openTab(page, "Klassifizierung")
    await pick(page, "Packungsgröße", new RegExp(`Gross${id}`))
    await openTab(page, "Kern & Identifikation")
    await expect(page.getByLabel("Artikelbezeichnung")).toHaveValue("Mein Verkaufsname")
  })

  test("Palettenklasse: chosen from the Merkmal table (no free text), stored as reference", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const kennziffer = await randomFreeKennziffer(tenant, await baseArticleId(tenant))
    const code = `PK${uid(testInfo)}`.slice(0, 20)
    const { data: klass } = await admin.from("pallet_classes").insert({ tenant_id: tenant, code }).select("id").single()
    createdMerkmale.push({ table: "pallet_classes", id: klass!.id })

    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Basisartikelnummer").fill(P3_BASE_CODE)
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await openTab(page, "Verpackung & Logistik")
    await expect(page.getByRole("textbox", { name: "Palettenklasse" })).toHaveCount(0)
    await pick(page, "Palettenklasse", code)
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(/\/artikelstamm\/[0-9a-f-]{36}/)

    const { data } = await admin
      .from("articles")
      .select("id, pallet_class_id")
      .eq("tenant_id", tenant)
      .eq("kennziffer", kennziffer)
      .eq("base_article_number", P3_BASE_CODE)
      .single()
    createdArticles.push(data!.id)
    expect(data!.pallet_class_id).toBe(klass!.id)

    // maintenance mask: Einkauf has the Palettenklassen mask and sees the entry
    await page.goto(`/merkmale/palettenklassen?mandant=${tenant}`)
    await expect(page.getByRole("heading", { name: "Palettenklassen" })).toBeVisible()
    await expect(page.getByText(code)).toBeVisible()
  })

  test("Verpackungsgruppe: the 4 weight fields are saved", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const name = `VG ${uid(testInfo)}`
    await login(page, P3_EINKAUF)
    await page.goto(`/merkmale/verpackungsgruppen?mandant=${tenant}`)
    await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
    await page.getByLabel("Bezeichnung").fill(name)
    await page.getByLabel(/Folie Systembeteiligung/).fill("1,5")
    await page.getByLabel(/Pappe Systembeteiligung/).fill("2")
    await page.getByLabel(/Folie Transport/).fill("3")
    await page.getByLabel(/Pappe Transport/).fill("4,25")
    await page.getByRole("dialog").getByRole("button", { name: "Anlegen" }).click()
    await expect(page.getByText(name)).toBeVisible()

    const { data } = await admin
      .from("packaging_groups")
      .select("id, foil_system_weight, cardboard_system_weight, foil_transport_weight, cardboard_transport_weight")
      .eq("tenant_id", tenant)
      .eq("name", name)
      .single()
    createdMerkmale.push({ table: "packaging_groups", id: data!.id })
    expect(data).toMatchObject({
      foil_system_weight: 1.5,
      cardboard_system_weight: 2,
      foil_transport_weight: 3,
      cardboard_transport_weight: 4.25,
    })
  })
})

test.describe("PROJ-3 QA Refinement 2026-10-07: Randfälle und Security", () => {
  test("AC: an invalid Basisartikelnummer (empty, letters, dot, space) is rejected in the form; nothing is saved", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const marker = `E2E QA BAN ${uid(testInfo)}`
    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await page.getByLabel("Artikelkennziffer").fill("0001")
    await page.getByLabel("Artikelbezeichnung").fill(marker)
    for (const value of ["", "12a45", "12.3", "1 2"]) {
      await page.getByLabel("Basisartikelnummer").fill(value)
      await page.getByRole("button", { name: "Speichern" }).click()
      await expect(page.getByText("Die Basisartikelnummer muss aus 1 bis 10 Ziffern bestehen")).toBeVisible()
      await expect(page).toHaveURL(/\/artikelstamm\/neu/)
    }
    const { count } = await admin.from("articles").select("id", { count: "exact", head: true }).eq("name", marker)
    expect(count).toBe(0)
    // 10 digits are fine and compose the number with a dot
    await page.getByLabel("Basisartikelnummer").fill("1234567890")
    await expect(page.getByLabel("Artikelnummer", { exact: true })).toHaveText("1234567890.0001")
  })

  test("API: Basisartikelnummer injection/overlong/non-ASCII digits → 400, nothing stored", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const marker = `E2E QA INJ ${uid(testInfo)}`
    await login(page, P3_EINKAUF)
    for (const value of ["1; drop table articles", "12345678901", "１２３", "١٢٣", "1' or '1'='1", " ", 123, null, ["1"]]) {
      const res = await page.request.post(`/api/tenants/${tenant}/articles`, {
        data: { baseArticleNumber: value, kennziffer: "0001", name: marker },
      })
      expect(res.status(), JSON.stringify(value)).toBe(400)
    }
    const { count } = await admin.from("articles").select("id", { count: "exact", head: true }).eq("name", marker)
    expect(count).toBe(0)
  })

  test("a Kürzel change via the API recomputes the Matchcode of all affected articles (also while an article is locked)", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const id = uid(testInfo)
    const { data: season } = await admin
      .from("seasons")
      .insert({ tenant_id: tenant, code: `Q${id}`.slice(0, 20), name: "QA Saison", commodity_digit: 5 })
      .select("id")
      .single()
    createdMerkmale.push({ table: "seasons", id: season!.id })
    const a1 = await mkArticle(tenant, await baseArticleId(tenant), { season_id: season!.id })
    const a2 = await mkArticle(tenant, await baseArticleId(tenant), { season_id: season!.id })
    const before = await admin.from("articles").select("match_code").eq("id", a1.id).single()
    expect(before.data!.match_code).toBe(`Q${id}`.slice(0, 20) + "-1200")

    // lock article 1 for the first Einkauf user, change the Kürzel as the second one
    const lockUser = await userClient(P3_EINKAUF)
    expect((await lockUser.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "article", p_resource_id: a1.id })).error).toBeNull()

    await login(page, P3_EINKAUF2)
    const newCode = `R${id}`.slice(0, 20)
    const res = await page.request.patch(`/api/tenants/${tenant}/merkmale/saisons/${season!.id}`, {
      data: { code: newCode, name: "QA Saison", commodityDigit: 5 },
    })
    expect(res.status()).toBe(200)
    for (const a of [a1, a2]) {
      const { data } = await admin.from("articles").select("match_code, article_number").eq("id", a.id).single()
      expect(data!.match_code).toBe(`${newCode}-1200`)
      expect(data!.article_number).toBe(a.number) // the article number does not depend on any Kürzel
    }
  })

  test("direct database access: the Matchcode and other calculated fields cannot be forged; Palettenklassen follow rights and tenants", async ({}, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const foreign = await tenantId(P3_TENANT_FREMD)
    const id = uid(testInfo)
    const einkauf = await userClient(P3_EINKAUF)

    const k = String(1000 + Math.floor(Math.random() * 9000))
    const ins = await einkauf
      .from("articles")
      .insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, kennziffer: k, match_code: "HACK", article_number: "HACK" })
      .select("id, match_code, article_number")
      .single()
    if (ins.data) createdArticles.push(ins.data.id)
    expect(ins.error).toBeNull()
    expect(ins.data!.match_code).toBe("")
    expect(ins.data!.article_number).toBe(`${P3_BASE_CODE}.${k}`)

    // a Basisartikelnummer that violates the format is rejected by the database as well
    for (const bad of ["12a", "12345678901", "", "１２３"]) {
      const res = await einkauf.from("articles").insert({ tenant_id: tenant, base_article_number: bad, kennziffer: "9999" })
      expect(res.error, bad).not.toBeNull()
    }

    // Palettenklassen: own tenant readable, foreign tenant invisible, no delete
    const own = await admin.from("pallet_classes").insert({ tenant_id: tenant, code: `RK${id}`.slice(0, 20) }).select("id").single()
    createdMerkmale.push({ table: "pallet_classes", id: own.data!.id })
    const other = await admin.from("pallet_classes").insert({ tenant_id: foreign, code: `FK${id}`.slice(0, 20) }).select("id").single()
    createdMerkmale.push({ table: "pallet_classes", id: other.data!.id })
    const seen = await einkauf.from("pallet_classes").select("id, tenant_id")
    expect(seen.data!.map((r) => r.id)).toContain(own.data!.id)
    expect(seen.data!.map((r) => r.id)).not.toContain(other.data!.id)
    // referencing a foreign Palettenklasse is refused by the composite foreign key
    const cross = await einkauf
      .from("articles")
      .insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, kennziffer: "9998", pallet_class_id: other.data!.id })
    expect(cross.error).not.toBeNull()
    // no hard delete of Palettenklassen, not even of the own tenant
    await einkauf.from("pallet_classes").delete().eq("id", own.data!.id)
    const still = await admin.from("pallet_classes").select("id").eq("id", own.data!.id)
    expect(still.data).toHaveLength(1)
    // a deactivated Palettenklasse cannot be chosen for new articles
    await admin.from("pallet_classes").update({ is_active: false }).eq("id", own.data!.id)
    const dead = await einkauf
      .from("articles")
      .insert({ tenant_id: tenant, base_article_number: P3_BASE_CODE, kennziffer: "9997", pallet_class_id: own.data!.id })
    expect(dead.error).not.toBeNull()
  })

  test("rights: Artikelstamm write alone does not allow maintaining Palettenklassen; the Palettenklassen mask alone does not show articles", async ({ page }, testInfo) => {
    const writer = await mkTenantWithUser(testInfo, [["artikelstamm", "write"]])
    await login(page, writer.username)
    const denied = await page.request.post(`/api/tenants/${writer.tenant}/merkmale/palettenklassen`, { data: { code: "A" } })
    expect(denied.status()).toBe(403)
    await page.goto(`/merkmale/palettenklassen?mandant=${writer.tenant}`)
    await expect(page.getByText(/Kein Zugriff/)).toBeVisible()

    const only = await mkTenantWithUser(testInfo, [["merkmal_palettenklasse", "write"]])
    await page.context().clearCookies()
    await login(page, only.username)
    const ok = await page.request.post(`/api/tenants/${only.tenant}/merkmale/palettenklassen`, { data: { code: "A" } })
    expect(ok.status()).toBe(201)
    const dup = await page.request.post(`/api/tenants/${only.tenant}/merkmale/palettenklassen`, { data: { code: "a" } })
    expect(dup.status()).toBe(409)
    await page.goto(`/artikelstamm?mandant=${only.tenant}`)
    await expect(page.getByText(/Kein Zugriff/)).toBeVisible()
  })

  test("XSS: Kürzel with HTML are rendered as text in the form, header and list; no script runs", async ({ page }, testInfo) => {
    const tenant = await tenantId(P3_TENANT)
    const dialogs: string[] = []
    page.on("dialog", async (d) => {
      dialogs.push(d.message())
      await d.dismiss()
    })
    const tail = Math.random().toString(36).slice(2, 6)
    const payload = `<i onclick=x()>${tail}`
    const { data: season } = await admin
      .from("seasons")
      .insert({ tenant_id: tenant, code: payload, name: "<img src=x onerror=alert(1)>", commodity_digit: 2 })
      .select("id")
      .single()
    createdMerkmale.push({ table: "seasons", id: season!.id })
    const article = await mkArticle(tenant, await baseArticleId(tenant), { season_id: season!.id, name: "<script>alert(2)</script>" })

    await login(page, P3_EINKAUF)
    await page.goto(articleUrl(tenant, article.id))
    await expect(page.getByText(`${payload}-1200`).first()).toBeVisible()
    await expect(page.locator("i[onclick]")).toHaveCount(0)
    await expect(page.locator("img[src='x']")).toHaveCount(0)
    // the search drops filter characters like ( ) , _ % (see BUG-6), so search for the harmless tail
    await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent(`${tail}-1200`)}`)
    // the Matchcode column is only shown from 1024 px up, so only require it in the DOM (as text)
    await expect(page.getByText(`${payload}-1200`)).toBeAttached()
    await expect(page.locator("i[onclick]")).toHaveCount(0)
    expect(dialogs).toEqual([])
  })

  test("search by Matchcode: partial, case-insensitive; PostgREST filter characters do not break the query or leak rows", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), {
      season_id: await merkmalId("seasons", tenant, "SOM"),
      article_type_id: await merkmalId("article_types", tenant, "FW"),
    })
    await login(page, P3_EINKAUF)
    for (const q of ["fw-som", "SOM-12", "W-SOM-1200"]) {
      await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent(q)}`)
      await expect(page.getByRole("link", { name: article.number })).toBeVisible()
    }
    for (const q of ["FW-SOM,is_active.eq.false", "x),(match_code.ilike.*", "%", "_", "\\"]) {
      const res = await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent(q)}`)
      expect(res!.status()).toBeLessThan(500)
      await expect(page.getByRole("heading", { name: "Artikelstamm" })).toBeVisible()
    }
  })

  test("header and Matchcode stay in the read-only view; a read-only user sees tabs but no edit option", async ({ page }) => {
    const tenant = await tenantId(P3_TENANT)
    const article = await mkArticle(tenant, await baseArticleId(tenant), {
      season_id: await merkmalId("seasons", tenant, "SOM"),
      name: "E2E QA Lesen",
    })
    await login(page, P3_LAGER)
    await page.goto(articleUrl(tenant, article.id))
    await expect(page.getByText(/SOM-1200 · E2E QA Lesen/)).toBeVisible()
    await expect(page.getByRole("tab")).toHaveCount(5)
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0)
    await openTab(page, "Verpackung & Logistik")
    await expect(page.getByLabel("GTIN Hauptartikel")).toBeDisabled()
    await expect(page.getByRole("combobox", { name: /Palettenklasse/ })).toBeDisabled()
  })
})

test.describe("PROJ-3 QA Refinement: known bugs (open)", () => {
  test("BUG-6 (open): a Kürzel containing '_' can be found in the list search", async ({ page }, testInfo) => {
    // Remove test.fail() once the list search escapes filter characters instead of dropping them.
    test.fail()
    const tenant = await tenantId(P3_TENANT)
    const id = uid(testInfo)
    const code = `A_${id}`.slice(0, 20)
    const { data: season } = await admin
      .from("seasons")
      .insert({ tenant_id: tenant, code, name: "QA Unterstrich", commodity_digit: 1 })
      .select("id")
      .single()
    createdMerkmale.push({ table: "seasons", id: season!.id })
    const article = await mkArticle(tenant, await baseArticleId(tenant), { season_id: season!.id })
    await login(page, P3_EINKAUF)
    await page.goto(`/artikelstamm?mandant=${tenant}&q=${encodeURIComponent(code)}`)
    await expect(page.getByRole("link", { name: article.number })).toBeVisible({ timeout: 3000 })
  })
})
