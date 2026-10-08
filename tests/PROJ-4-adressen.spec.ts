import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import {
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  P2_PASSWORD,
  P2_TENANT_ADMIN,
  P2_TENANT_NORD,
  P4_ADMIN,
  P4_BASE_CODE,
  P4_EINKAUF,
  P4_EINKAUF2,
  P4_EMAIL_DOMAIN,
  P4_FREMD,
  P4_LAGER,
  P4_LAGER_OHNE_KONTAKTE,
  P4_LEER,
  P4_NUR_ARTIKEL,
  P4_NUR_KONTAKTE,
  P4_OHNE,
  P4_PASSWORD,
  P4_TENANT,
  P4_TENANT_FREMD,
  P4_TENANT_LEER,
  P4_TENANT_PREFIX,
} from "./fixtures"

// Fixtures (3 tenants, roles, users, countries/base article of the main tenant) come from
// tests/global-setup.ts. Everything a test mutates is created per test with a random address base
// (chromium and Mobile Safari run in parallel) and removed in afterEach; tests/global-teardown.ts
// sweeps the rest by email domain / tenant prefix.
// P4_TENANT_LEER must stay empty (no addresses, no countries): only read-only tests use it.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// The Next dev server compiles routes on first use; a request that hits a route while it compiles can be
// reset (ECONNRESET) or a navigation can be interrupted. One retry absorbs that; real bugs fail twice.
test.describe.configure({ retries: 1 })

let createdAddresses: string[] = []
let createdContacts: string[] = []
let createdArticles: string[] = []
let createdCountries: string[] = []
let createdTenants: string[] = []
let createdUsers: string[] = []
let createdRoles: string[] = []

test.afterEach(async () => {
  for (const id of [...createdAddresses, ...createdContacts]) {
    await admin.from("edit_locks").delete().eq("resource_id", id)
  }
  if (createdArticles.length) await admin.from("articles").delete().in("id", createdArticles)
  if (createdContacts.length) await admin.from("contacts").delete().in("id", createdContacts)
  // one statement: addresses reference each other (parent/invoice links), checked at statement end
  if (createdAddresses.length) await admin.from("addresses").delete().in("id", createdAddresses)
  if (createdCountries.length) await admin.from("countries").delete().in("id", createdCountries)
  for (const id of createdRoles) await admin.from("roles").delete().eq("id", id)
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id)
  for (const id of createdTenants) await admin.from("tenants").delete().eq("id", id)
  createdAddresses = []
  createdContacts = []
  createdArticles = []
  createdCountries = []
  createdTenants = []
  createdUsers = []
  createdRoles = []
})

function uid(testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/\W/g, "").toLowerCase().slice(0, 4)
  return `${project}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

function randomBase() {
  return String(10_000_000 + Math.floor(Math.random() * 89_999_999))
}

async function tenantId(name: string) {
  const { data, error } = await admin.from("tenants").select("id").eq("name", name).single()
  if (error) throw error
  return data.id as string
}

async function countryId(tenant: string, code: string) {
  const { data, error } = await admin.from("countries").select("id").eq("tenant_id", tenant).eq("code", code).single()
  if (error) throw error
  return data.id as string
}

interface MkAddress {
  id: string
  number: string
  base: string
  suffix: string
  name: string
}

/** Inserts an address as service role (no lock / status checks); random base, retried on collisions. */
async function mkAddress(tenant: string, extra: Record<string, unknown> = {}): Promise<MkAddress> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const base = (extra.address_base as string | undefined) ?? randomBase()
    const suffix = (extra.address_suffix as string | undefined) ?? "0001"
    const name = (extra.name as string | undefined) ?? `E2E ${Math.random().toString(36).slice(2, 8)}`
    const { data, error } = await admin
      .from("addresses")
      .insert({ ...extra, tenant_id: tenant, address_base: base, address_suffix: suffix, name })
      .select("id, address_number")
      .single()
    if (!error) {
      createdAddresses.push(data.id)
      return { id: data.id as string, number: data.address_number as string, base, suffix, name }
    }
    if (error.code !== "23505" || extra.address_base) throw error
  }
  throw new Error("no free address base")
}

async function mkContact(tenant: string, addressId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("contacts")
    .insert({ last_name: `Kontakt${Math.random().toString(36).slice(2, 7)}`, ...extra, tenant_id: tenant, address_id: addressId })
    .select("id, last_name")
    .single()
  if (error) throw error
  createdContacts.push(data.id)
  return { id: data.id as string, lastName: data.last_name as string }
}

/** Valid PATCH body for an address row (all fields; `overrides` win). */
async function bodyOf(id: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin.from("addresses").select("*").eq("id", id).single()
  if (error) throw error
  return {
    addressBase: data.address_base,
    suffix: data.address_suffix,
    name: data.name,
    nameAddition: data.name_addition,
    code: data.code,
    gln: data.gln,
    roles: data.roles,
    street: data.street,
    houseNumber: data.house_number,
    postalCode: data.postal_code,
    city: data.city,
    countryId: data.country_id,
    phone: data.phone,
    email: data.email,
    website: data.website,
    vatId: data.vat_id,
    remark: data.remark,
    parentAddressId: data.parent_address_id,
    invoiceRecipientId: data.invoice_recipient_id,
    invoiceShipToId: data.invoice_ship_to_id,
    billingCompanyId: data.billing_company_id,
    ...overrides,
  }
}

async function mkArticle(tenant: string, extra: Record<string, unknown> = {}) {
  const { data: base } = await admin.from("base_articles").select("id").eq("tenant_id", tenant).eq("code", P4_BASE_CODE).single()
  for (let attempt = 0; attempt < 20; attempt++) {
    const k = String(1000 + Math.floor(Math.random() * 9000))
    const { data, error } = await admin
      .from("articles")
      .insert({ tenant_id: tenant, base_article_number: P4_BASE_CODE, base_article_id: base!.id, kennziffer: k, ...extra })
      .select("id, article_number, match_code")
      .single()
    if (!error) {
      createdArticles.push(data.id)
      return { id: data.id as string, number: data.article_number as string, matchCode: data.match_code as string | null }
    }
    if (error.code !== "23505") throw error
  }
  throw new Error("no free kennziffer")
}

// Retries: when the button is clicked before React has hydrated (slow dev server, WebKit), the form
// is submitted natively and the page reloads on /login.
async function login(page: Page, username: string, password = P4_PASSWORD) {
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

async function userClient(username: string) {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: `${username}@${P4_EMAIL_DOMAIN}`,
    password: P4_PASSWORD,
  })
  if (error) throw error
  return client
}

type Perm = [string, "read" | "write", boolean?]

/** Own tenant + role + user (for tests that need an empty or large tenant, or that log out). */
async function mkTenantWithUser(testInfo: TestInfo, perms: Perm[]) {
  const id = uid(testInfo)
  const { data: tenant } = await admin.from("tenants").insert({ name: `${P4_TENANT_PREFIX}${id}` }).select("id").single()
  createdTenants.push(tenant!.id)
  const { data: role } = await admin.from("roles").insert({ tenant_id: tenant!.id, name: "R" }).select("id").single()
  createdRoles.push(role!.id)
  await admin.from("role_permissions").insert(
    perms.map(([maske, access_level, toggle]) => ({
      role_id: role!.id,
      module: "warenwirtschaft",
      maske,
      access_level,
      can_toggle_active: toggle === true,
    }))
  )
  const username = `p4${id}`
  const email = `${username}@${P4_EMAIL_DOMAIN}`
  const { data: user } = await admin.auth.admin.createUser({ email, password: P4_PASSWORD, email_confirm: true })
  createdUsers.push(user.user!.id)
  await admin.from("user_profiles").insert({ id: user.user!.id, username, email })
  await admin.from("user_tenant_access").insert({ user_id: user.user!.id, tenant_id: tenant!.id })
  await admin.from("user_roles").insert({ user_id: user.user!.id, tenant_id: tenant!.id, role_id: role!.id })
  return { tenant: tenant!.id as string, username }
}

/** Own user with the given role of the main tenant (signOut ends ALL sessions of a user). */
async function mkUserWithRole(testInfo: TestInfo, roleName: string) {
  const tenant = await tenantId(P4_TENANT)
  const { data: role } = await admin.from("roles").select("id").eq("tenant_id", tenant).eq("name", roleName).single()
  const username = `p4u${uid(testInfo)}`
  const email = `${username}@${P4_EMAIL_DOMAIN}`
  const { data: user } = await admin.auth.admin.createUser({ email, password: P4_PASSWORD, email_confirm: true })
  createdUsers.push(user.user!.id)
  await admin.from("user_profiles").insert({ id: user.user!.id, username, email })
  await admin.from("user_tenant_access").insert({ user_id: user.user!.id, tenant_id: tenant })
  await admin.from("user_roles").insert({ user_id: user.user!.id, tenant_id: tenant, role_id: role!.id })
  return username
}

async function openUserMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /Benutzermenü für/ })
  if (!(await trigger.isVisible())) {
    await page.getByRole("button", { name: "Navigation ein-/ausblenden" }).click()
  }
  await trigger.click()
}

/** goto with retries: right after a router.refresh() WebKit can interrupt the navigation. */
async function go(page: Page, url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.waitForLoadState("networkidle")
      await page.goto(url)
      return
    } catch (error) {
      if (attempt >= 3) throw error
    }
  }
}

const addressUrl = (tenant: string, id: string) => `/adressen/${id}?mandant=${tenant}`

async function openTab(page: Page, name: string | RegExp) {
  await page.getByRole("tab", { name }).click()
}

/** Select trigger via its visible label (works for Merkmal and Adress selects alike). */
function combo(page: Page, label: string) {
  return page.locator("label", { hasText: label }).locator("xpath=..").getByRole("combobox")
}

/** Picks an address in an Adress-Auswahlfeld by searching for (part of) its name. */
async function pickAddress(page: Page, label: string, search: string) {
  await combo(page, label).click()
  await page.getByPlaceholder("Nummer, Name oder Kürzel suchen …").fill(search)
  await page.getByRole("option", { name: new RegExp(search) }).click()
}

async function startEditing(page: Page) {
  await page.getByRole("button", { name: "Bearbeiten" }).click()
  await expect(page.getByRole("button", { name: "Speichern" })).toBeVisible()
}

async function fillNewAddress(page: Page, v: { base: string; suffix: string; name: string }) {
  await page.getByLabel("Adressnummer-Basis").fill(v.base)
  await page.getByRole("textbox", { name: /^Kennziffer/ }).fill(v.suffix)
  await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill(v.name)
}

async function lockAddress(page: Page, tenant: string, id: string, type = "address") {
  const res = await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: type, resourceId: id } })
  expect(res.status(), await res.text()).toBe(200)
}

// =============================================================================================
test.describe("PROJ-4: Adressen – Anlegen, Nummer, Validierung", () => {
  test("AC-1/9/10: creating an address composes the number; general contact data and several roles are stored", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const base = randomBase()
    const name = `E2E Anlegen ${uid(testInfo)}`

    await login(page, P4_EINKAUF)
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    await fillNewAddress(page, { base, suffix: "0001", name })
    // live preview before saving
    await expect(page.getByLabel("Adressnummer", { exact: true })).toHaveText(`${base}.0001`)
    await page.getByLabel("Kunde", { exact: true }).check()
    await page.getByLabel("Lieferadresse", { exact: true }).check()
    await openTab(page, "Anschrift & Erreichbarkeit")
    await page.getByLabel("Telefon").fill("+49 40 123456")
    await page.getByLabel("E-Mail").fill("zentrale@example.com")
    await page.getByLabel("Webseite").fill("https://example.com")
    await page.getByRole("button", { name: "Speichern" }).click()

    await expect(page).toHaveURL(new RegExp(`/adressen/[0-9a-f-]{36}\\?mandant=${tenant}`))
    await expect(page.getByRole("heading", { name: `${base}.0001` })).toBeVisible()

    const { data } = await admin.from("addresses").select("*").eq("tenant_id", tenant).eq("address_base", base).single()
    createdAddresses.push(data!.id)
    expect(data).toMatchObject({
      address_number: `${base}.0001`,
      name,
      is_active: true,
      phone: "+49 40 123456",
      email: "zentrale@example.com",
      website: "https://example.com",
    })
    expect([...data!.roles].sort()).toEqual(["customer", "delivery_address"])

    // shown again in the tab "Anschrift & Erreichbarkeit" and as role badges in the header
    await openTab(page, "Anschrift & Erreichbarkeit")
    await expect(page.getByLabel("E-Mail")).toHaveValue("zentrale@example.com")
    await expect(page.getByLabel("Telefon")).toHaveValue("+49 40 123456")
    await expect(page.getByText("Kunde", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Lieferadresse", { exact: true }).first()).toBeVisible()
  })

  test("AC-2/3/4/7/8/11: invalid input shows validation errors, marks the tab and saves nothing", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const marker = `E2E Valid ${uid(testInfo)}`
    const count = async () =>
      (await admin.from("addresses").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).like("name", `${marker}%`)).count

    await login(page, P4_EINKAUF)
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    const save = page.getByRole("button", { name: "Speichern" })

    // five tabs next to each other, header with title stays visible
    await expect(page.getByRole("heading", { name: "Neue Adresse" })).toBeVisible()
    for (const tab of ["Stammdaten", "Anschrift & Erreichbarkeit", "Kontakt", "Verknüpfungen", "Steuer & Bemerkung"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible()
    }

    // empty base + suffix + name
    await save.click()
    await expect(page.getByText("Bitte die Adressnummer-Basis angeben")).toBeVisible()
    await expect(page.getByText("Bitte die Kennziffer angeben")).toBeVisible()
    await expect(page.getByText("Bitte Name/Firma angeben")).toBeVisible()
    await expect(page.getByRole("tab", { name: /Stammdaten/ })).toContainText("enthält Fehler")

    // letters in the base
    await fillNewAddress(page, { base: "12ab", suffix: "0001", name: marker })
    await save.click()
    await expect(page.getByText("Nur Ziffern erlaubt")).toBeVisible()

    // suffix with 3 digits / letters
    await page.getByLabel("Adressnummer-Basis").fill("4711")
    await page.getByRole("textbox", { name: /^Kennziffer/ }).fill("123")
    await save.click()
    await expect(page.getByText("Die Kennziffer muss genau 4 Ziffern haben")).toBeVisible()
    await page.getByRole("textbox", { name: /^Kennziffer/ }).fill("12ab")
    await save.click()
    await expect(page.getByText("Die Kennziffer muss genau 4 Ziffern haben")).toBeVisible()

    // GLN with 12 digits (error sits in the same tab; the tab stays marked)
    await page.getByRole("textbox", { name: /^Kennziffer/ }).fill("0001")
    await page.getByLabel("GLN").fill("123456789012")
    await save.click()
    await expect(page.getByText("Die GLN muss genau 13 Ziffern haben")).toBeVisible()
    await page.getByLabel("GLN").fill("")

    // invalid e-mail: error is in another tab → the form jumps there and marks it
    await openTab(page, "Anschrift & Erreichbarkeit")
    await page.getByLabel("E-Mail").fill("keine-email")
    await openTab(page, "Stammdaten")
    await save.click()
    await expect(page.getByText("Bitte eine gültige E-Mail-Adresse angeben")).toBeVisible()
    await expect(page.getByRole("tab", { name: /Anschrift & Erreichbarkeit/ })).toContainText("enthält Fehler")
    await expect(page.getByRole("tab", { name: /Anschrift & Erreichbarkeit/ })).toHaveAttribute("aria-selected", "true")

    await expect(page.getByRole("heading", { name: "Neue Adresse" })).toBeVisible()
    expect(await count()).toBe(0)
    await expect(page).toHaveURL(/\/adressen\/neu/)
  })

  test("API: base > 10 digits, non-ASCII digits, GLN and e-mail formats are refused by the server too", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    await login(page, P4_EINKAUF)
    const post = (data: unknown) => page.request.post(`/api/tenants/${tenant}/addresses`, { data })
    const ok = { addressBase: randomBase(), suffix: "0001", name: "E2E API" }

    expect((await post({ ...ok, addressBase: "12345678901" })).status()).toBe(400)
    expect((await post({ ...ok, addressBase: "" })).status()).toBe(400)
    expect((await post({ ...ok, addressBase: "١٢٣٤" })).status()).toBe(400) // Arabic-Indic digits
    expect((await post({ ...ok, suffix: "12345" })).status()).toBe(400)
    expect((await post({ ...ok, suffix: "００１１" })).status()).toBe(400) // full-width digits
    expect((await post({ ...ok, name: "   " })).status()).toBe(400)
    expect((await post({ ...ok, gln: "123456789012" })).status()).toBe(400)
    expect((await post({ ...ok, gln: "12345678901234" })).status()).toBe(400)
    expect((await post({ ...ok, email: "a@b" })).status()).toBe(400)
    expect((await post({ ...ok, roles: ["boss"] })).status()).toBe(400)
    expect((await post({ ...ok, vatId: "x".repeat(16) })).status()).toBe(400)
    expect((await post({ ...ok, postalCode: "x".repeat(11) })).status()).toBe(400)
    expect((await post({ ...ok, code: "x".repeat(11) })).status()).toBe(400)
    expect((await post({ ...ok, parentAddressId: "not-a-uuid" })).status()).toBe(400)
    const none = await admin.from("addresses").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("address_base", ok.addressBase)
    expect(none.count).toBe(0)
  })

  test("AC-5: an address number that exists in the tenant is refused with 'Adressnummer bereits vergeben'", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const existing = await mkAddress(tenant, { address_suffix: "0007" })

    await login(page, P4_EINKAUF)
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    await fillNewAddress(page, { base: existing.base, suffix: "0007", name: "E2E Duplikat" })
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByText("Adressnummer bereits vergeben")).toBeVisible()
    await expect(page).toHaveURL(/\/adressen\/neu/)
    const { count } = await admin.from("addresses").select("id", { count: "exact", head: true }).eq("tenant_id", tenant).eq("address_number", existing.number)
    expect(count).toBe(1)

    // the same number in ANOTHER tenant is fine (unique per tenant)
    const foreign = await tenantId(P4_TENANT_FREMD)
    const other = await mkAddress(foreign, { address_base: existing.base, address_suffix: "0007" })
    expect(other.number).toBe(existing.number)
  })

  test("AC-6: entering an existing base suggests the next free suffix, which can be changed", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const a = await mkAddress(tenant, { address_suffix: "0001" })
    await mkAddress(tenant, { address_base: a.base, address_suffix: "0002" })

    await login(page, P4_EINKAUF)
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    await page.getByLabel("Adressnummer-Basis").fill(a.base)
    // empty suffix is prefilled with the next free one …
    await expect(page.getByRole("textbox", { name: /^Kennziffer/ })).toHaveValue("0003")
    // … and stays changeable; a deviating value offers "Übernehmen"
    await page.getByRole("textbox", { name: /^Kennziffer/ }).fill("0042")
    await expect(page.getByText("nächste freie Kennziffer")).toBeVisible()
    await page.getByRole("button", { name: "Übernehmen" }).click()
    await expect(page.getByRole("textbox", { name: /^Kennziffer/ })).toHaveValue("0003")

    // a new base gets no suggestion
    await page.getByLabel("Adressnummer-Basis").fill(randomBase())
    await expect(page.getByText("nächste freie Kennziffer")).toHaveCount(0)
  })

  test("API: next-suffix fills gaps once 9999 is used and reports unknown bases", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const a = await mkAddress(tenant, { address_suffix: "9999" })
    await mkAddress(tenant, { address_base: a.base, address_suffix: "0000" })
    await login(page, P4_EINKAUF)
    const res = await page.request.get(`/api/tenants/${tenant}/addresses/next-suffix?base=${a.base}`)
    expect(await res.json()).toEqual({ exists: true, suffix: "0001" })
    const unknown = await page.request.get(`/api/tenants/${tenant}/addresses/next-suffix?base=${randomBase()}`)
    expect(await unknown.json()).toEqual({ exists: false, suffix: null })
    expect((await page.request.get(`/api/tenants/${tenant}/addresses/next-suffix?base=abc`)).status()).toBe(400)
  })

  test("Edge: concurrent creation of the same number — the database lets exactly one win", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    await login(page, P4_EINKAUF)
    const base = randomBase()
    const body = { addressBase: base, suffix: "0001", name: "E2E Race" }
    const results = await Promise.all(
      Array.from({ length: 6 }, () => page.request.post(`/api/tenants/${tenant}/addresses`, { data: body }))
    )
    const statuses = results.map((r) => r.status()).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(5)
    const { data } = await admin.from("addresses").select("id").eq("tenant_id", tenant).eq("address_base", base)
    expect(data).toHaveLength(1)
    createdAddresses.push(data![0].id)
  })
})

// =============================================================================================
test.describe("PROJ-4: Adressen – Kürzel und Markeninhaber", () => {
  test("AC-12: a duplicate Kürzel shows a hint naming the other address (also inactive ones) but does not block saving", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const code = `K${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
    const active = await mkAddress(tenant, { code })
    const inactive = await mkAddress(tenant, { code: code.toLowerCase(), is_active: false })

    await login(page, P4_EINKAUF)
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    const base = randomBase()
    const name = `E2E Kürzel ${uid(testInfo)}`
    await fillNewAddress(page, { base, suffix: "0001", name })
    await page.getByRole("textbox", { name: /^Kürzel/ }).fill(code)
    const hint = page.getByRole("status").filter({ hasText: "Kürzel wird bereits verwendet" })
    await expect(hint).toBeVisible()
    await expect(hint).toContainText(active.number)
    await expect(hint).toContainText(inactive.number)
    await expect(hint).toContainText("(inaktiv)")

    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(/\/adressen\/[0-9a-f-]{36}/)
    const { data } = await admin.from("addresses").select("id, code").eq("tenant_id", tenant).eq("address_base", base).single()
    createdAddresses.push(data!.id)
    expect(data!.code).toBe(code)

    // API check: excludes the address itself, lists inactive ones
    const res = await page.request.get(`/api/tenants/${tenant}/addresses/code-check?code=${code}&excludeId=${data!.id}`)
    const items = (await res.json()).items as { addressNumber: string }[]
    expect(items.map((i) => i.addressNumber).sort()).toEqual([active.number, inactive.number].sort())
  })

  test("AC-13/14/15/16: Markeninhaber offers only active addresses with Kürzel; the Matchcode follows the Kürzel", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const tag = uid(testInfo).replace(/[^a-z0-9]/g, "").slice(-6)
    const withCode = await mkAddress(tenant, { name: `BO Mit ${tag}`, code: "BOA" })
    const noCode = await mkAddress(tenant, { name: `BO Ohne ${tag}` })
    const inactive = await mkAddress(tenant, { name: `BO Inaktiv ${tag}`, code: "BOI", is_active: false })

    await login(page, P4_EINKAUF)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await combo(page, "Markeninhaber").click()
    await page.getByPlaceholder("Nummer, Name oder Kürzel suchen …").fill(`BO `)
    await expect(page.getByRole("option", { name: new RegExp(`BO Mit ${tag}`) })).toBeVisible()
    await expect(page.getByRole("option", { name: new RegExp(`BO Ohne ${tag}`) })).toHaveCount(0)
    await expect(page.getByRole("option", { name: new RegExp(`BO Inaktiv ${tag}`) })).toHaveCount(0)
    await page.getByRole("option", { name: new RegExp(`BO Mit ${tag}`) }).click()

    // Matchcode preview uses the Kürzel of the address
    await openTab(page, "Kern & Identifikation")
    await expect(page.getByLabel("Matchcode", { exact: true })).toHaveText(/BOA/)
    await page.getByLabel("Basisartikelnummer").fill(P4_BASE_CODE)
    const kennziffer = String(1000 + Math.floor(Math.random() * 9000))
    await page.getByLabel("Artikelkennziffer").fill(kennziffer)
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page).toHaveURL(/\/artikelstamm\/[0-9a-f-]{36}/)
    const { data: article } = await admin.from("articles").select("id, match_code, brand_owner_id").eq("tenant_id", tenant).eq("kennziffer", kennziffer).eq("base_article_number", P4_BASE_CODE).single()
    createdArticles.push(article!.id)
    expect(article!.brand_owner_id).toBe(withCode.id)
    expect(article!.match_code).toContain("BOA")

    // changing the Kürzel of the address recomputes the Matchcode of the article
    await lockAddress(page, tenant, withCode.id)
    const patch = await page.request.patch(`/api/tenants/${tenant}/addresses/${withCode.id}`, {
      data: await bodyOf(withCode.id, { code: "NEU" }),
    })
    expect(patch.status(), await patch.text()).toBe(200)
    await expect.poll(async () => (await admin.from("articles").select("match_code").eq("id", article!.id).single()).data!.match_code).toContain("NEU")
    expect((await admin.from("articles").select("match_code").eq("id", article!.id).single()).data!.match_code).not.toContain("BOA")

    // removing the Kürzel skips that part of the Matchcode, the reference stays
    await lockAddress(page, tenant, withCode.id)
    const cleared = await page.request.patch(`/api/tenants/${tenant}/addresses/${withCode.id}`, {
      data: await bodyOf(withCode.id, { code: null }),
    })
    expect(cleared.status()).toBe(200)
    await expect.poll(async () => (await admin.from("articles").select("match_code").eq("id", article!.id).single()).data!.match_code).not.toContain("NEU")
    expect((await admin.from("articles").select("brand_owner_id").eq("id", article!.id).single()).data!.brand_owner_id).toBe(withCode.id)

    // an address without Kürzel cannot be chosen via the API either
    const art2 = await mkArticle(tenant)
    await lockArticle(page, tenant, art2.id)
    const res = await page.request.patch(`/api/tenants/${tenant}/articles/${art2.id}`, {
      data: { baseArticleNumber: P4_BASE_CODE, kennziffer: art2.number.split(".")[1], brandOwnerId: noCode.id },
    })
    expect(res.status(), await res.text()).toBe(400)
    void inactive
  })

  test("AC-39: a deactivated Markeninhaber stays visible at the article (inaktiv) but is not offered again", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const tag = uid(testInfo).replace(/[^a-z0-9]/g, "").slice(-6)
    const owner = await mkAddress(tenant, { name: `BO Stillgelegt ${tag}`, code: "BOS" })
    const article = await mkArticle(tenant, { brand_owner_id: owner.id })
    await admin.from("addresses").update({ is_active: false }).eq("id", owner.id)

    await login(page, P4_EINKAUF)
    await page.goto(`/artikelstamm/${article.id}?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await expect(combo(page, "Markeninhaber")).toContainText("(inaktiv)")
    await expect(combo(page, "Markeninhaber")).toContainText(owner.number)
    // still in the Matchcode of the stored article
    expect((await admin.from("articles").select("match_code").eq("id", article.id).single()).data!.match_code).toContain("BOS")
  })

  test("AC-14: without any address with Kürzel the field shows 'Noch keine Adresse mit Kürzel' and links to the address mask", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT_LEER)
    await login(page, P4_LEER)
    await page.goto(`/artikelstamm/neu?mandant=${tenant}`)
    await openTab(page, "Klassifizierung")
    await combo(page, "Markeninhaber").click()
    await expect(page.getByText("Noch keine Adresse mit Kürzel")).toBeVisible()
    await expect(page.getByRole("link", { name: /hier anlegen/ })).toHaveAttribute("href", `/adressen/neu?mandant=${tenant}`)
  })
})

async function lockArticle(page: Page, tenant: string, id: string) {
  const res = await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "article", resourceId: id } })
  expect(res.status(), await res.text()).toBe(200)
}

// =============================================================================================
test.describe("PROJ-4: Länder (Merkmal-Tabelle)", () => {
  test("AC-17/18/19: Länder can be created, the Kürzel is stored in capitals, invalid and duplicate Kürzel are refused", async ({ page }, testInfo) => {
    const t = await mkTenantWithUser(testInfo, [["merkmal_laender", "write"]])
    await login(page, t.username)
    await page.goto(`/merkmale/laender?mandant=${t.tenant}`)
    const dialog = page.getByRole("dialog")

    await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
    await dialog.getByLabel("Land", { exact: false }).first().fill("Vereinigte Arabische Emirate")
    await dialog.getByLabel("Länderkürzel").fill("vae")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(page.getByText("Vereinigte Arabische Emirate")).toBeVisible()

    await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
    await dialog.getByLabel("Land", { exact: false }).first().fill("Emirate kurz")
    await dialog.getByLabel("Länderkürzel").fill("ae")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(page.getByText("Emirate kurz")).toBeVisible()

    const { data } = await admin.from("countries").select("code, name").eq("tenant_id", t.tenant).order("code")
    expect(data!.map((c) => c.code)).toEqual(["AE", "VAE"])

    // invalid: 1 letter, 4 letters, digits — nothing stored
    for (const bad of ["a", "a1"]) {
      await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
      await dialog.getByLabel("Land", { exact: false }).first().fill("Ungültig")
      await dialog.getByLabel("Länderkürzel").fill(bad)
      await dialog.getByRole("button", { name: "Anlegen" }).click()
      await expect(dialog).toBeVisible()
      await dialog.getByRole("button", { name: "Abbrechen" }).click()
    }
    // duplicate (case-insensitive)
    await page.getByRole("button", { name: "Neuer Eintrag" }).first().click()
    await dialog.getByLabel("Land", { exact: false }).first().fill("Doppelt")
    await dialog.getByLabel("Länderkürzel").fill("Vae")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Abbrechen" }).click()
    const after = await admin.from("countries").select("code").eq("tenant_id", t.tenant)
    expect(after.data).toHaveLength(2)
  })

  test("API: Länderkürzel rules are enforced server-side (2–3 letters, unique per tenant, capitals)", async ({ page }, testInfo) => {
    const t = await mkTenantWithUser(testInfo, [["merkmal_laender", "write"]])
    await login(page, t.username)
    const post = (data: unknown) => page.request.post(`/api/tenants/${t.tenant}/merkmale/laender`, { data })
    expect((await post({ code: "A", name: "x" })).status()).toBe(400)
    expect((await post({ code: "ABCD", name: "x" })).status()).toBe(400)
    expect((await post({ code: "A1", name: "x" })).status()).toBe(400)
    expect((await post({ code: "A B", name: "x" })).status()).toBe(400)
    expect((await post({ code: "DE", name: "" })).status()).toBe(400)
    const ok = await post({ code: "de", name: "Deutschland" })
    expect(ok.status(), await ok.text()).toBe(201)
    expect((await post({ code: "DE", name: "Nochmal" })).status()).toBe(409)
    expect((await admin.from("countries").select("code").eq("tenant_id", t.tenant)).data).toEqual([{ code: "DE" }])
    // the Merkmal "Markeninhaber" is gone
    expect((await page.request.post(`/api/tenants/${t.tenant}/merkmale/markeninhaber`, { data: { code: "X", name: "x" } })).status()).toBe(404)
  })

  test("AC-20/21: an empty Länder table shows 'Noch keine Einträge – hier anlegen'; the label 'Land' links to the maintenance mask", async ({ page }) => {
    const empty = await tenantId(P4_TENANT_LEER)
    await login(page, P4_LEER)
    await page.goto(`/adressen/neu?mandant=${empty}`)
    await openTab(page, "Anschrift & Erreichbarkeit")
    await combo(page, "Land").click()
    await expect(page.getByText("Noch keine Einträge")).toBeVisible()
    await expect(page.getByRole("link", { name: /hier anlegen/ })).toHaveAttribute("href", `/merkmale/laender?mandant=${empty}`)
    await page.keyboard.press("Escape")

    // the label links to the maintenance mask (new tab) when the user may open it
    const link = page.getByRole("link", { name: /^Land/ }).first()
    await expect(link).toHaveAttribute("href", `/merkmale/laender?mandant=${empty}`)
    const [popup] = await Promise.all([page.context().waitForEvent("page"), link.click()])
    await popup.waitForLoadState()
    await expect(popup).toHaveURL(new RegExp(`/merkmale/laender\\?mandant=${empty}`))
    await expect(popup.getByRole("heading", { name: /Länder/ })).toBeVisible()
    await expect(page).toHaveURL(/\/adressen\/neu/)
  })

  test("Edge: a deactivated Land stays visible at the address but is not offered for new choices", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const { data: c } = await admin.from("countries").insert({ tenant_id: tenant, code: "ZZ", name: "Zzland" }).select("id").single()
    createdCountries.push(c!.id)
    const address = await mkAddress(tenant, { country_id: c!.id })
    await admin.from("countries").update({ is_active: false }).eq("id", c!.id)

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Anschrift & Erreichbarkeit")
    await expect(combo(page, "Land")).toContainText("ZZ")
    await page.goto(`/adressen?mandant=${tenant}&status=alle&q=${address.base}`)
    await expect(page.getByRole("row", { name: new RegExp(address.number) })).toContainText("ZZ")
    // not offered when choosing (new address form)
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    await openTab(page, "Anschrift & Erreichbarkeit")
    await combo(page, "Land").click()
    await expect(page.getByRole("option", { name: /Zzland|ZZ/ })).toHaveCount(0)
    await expect(page.getByRole("option", { name: /DE/ })).toBeVisible()
  })
})

// =============================================================================================
test.describe("PROJ-4: Hierarchie und Verknüpfungen", () => {
  test("AC-22/23: a parent address is saved; all children are listed on the parent and reachable by click", async ({ page }) => {
    test.setTimeout(60_000)
    const tenant = await tenantId(P4_TENANT)
    const parent = await mkAddress(tenant, { name: "E2E Zentrale" })
    const child1 = await mkAddress(tenant, { name: "E2E Filiale Eins" })
    const child2 = await mkAddress(tenant, { name: "E2E Filiale Zwei" })

    await login(page, P4_EINKAUF)
    for (const child of [child1, child2]) {
      await go(page, addressUrl(tenant, child.id))
      await startEditing(page)
      await openTab(page, "Verknüpfungen")
      await pickAddress(page, "Übergeordnete Adresse", parent.number)
      await page.getByRole("button", { name: "Speichern" }).click()
      await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()
      expect((await admin.from("addresses").select("parent_address_id").eq("id", child.id).single()).data!.parent_address_id).toBe(parent.id)
    }

    await go(page, addressUrl(tenant, parent.id))
    await openTab(page, "Verknüpfungen")
    await expect(page.getByRole("link", { name: new RegExp(child1.number) })).toBeVisible()
    await expect(page.getByRole("link", { name: new RegExp(child2.number) })).toBeVisible()
    await page.getByRole("link", { name: new RegExp(child2.number) }).click()
    await expect(page).toHaveURL(new RegExp(child2.id))

    // the list shows the parent per row
    await page.goto(`/adressen?mandant=${tenant}&q=${child1.base}`)
    await expect(page.getByRole("row", { name: new RegExp(child1.number) })).toContainText(parent.number)
  })

  test("AC-24/Edge: cycles (self, child, chain) are refused by the UI selection and by the database", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const a = await mkAddress(tenant, { name: "E2E Zyklus A" })
    const b = await mkAddress(tenant, { name: "E2E Zyklus B", parent_address_id: a.id })
    const c = await mkAddress(tenant, { name: "E2E Zyklus C", parent_address_id: b.id })

    await login(page, P4_EINKAUF)
    // UI: the descendants and the address itself are not offered as parent
    await page.goto(addressUrl(tenant, a.id))
    await startEditing(page)
    await openTab(page, "Verknüpfungen")
    await combo(page, "Übergeordnete Adresse").click()
    await page.getByPlaceholder("Nummer, Name oder Kürzel suchen …").fill("E2E Zyklus")
    await expect(page.getByText("Keine Treffer.")).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Abbrechen" }).click()

    // API: self, direct child, grand-child
    for (const target of [a.id, b.id, c.id]) {
      await lockAddress(page, tenant, a.id)
      const res = await page.request.patch(`/api/tenants/${tenant}/addresses/${a.id}`, {
        data: await bodyOf(a.id, { parentAddressId: target }),
      })
      expect(res.status(), `parent=${target}: ${await res.text()}`).toBe(400)
      expect((await res.json()).field).toBe("parentAddressId")
    }
    expect((await admin.from("addresses").select("parent_address_id").eq("id", a.id).single()).data!.parent_address_id).toBeNull()

    // direct database access cannot create a cycle either
    const einkauf = await userClient(P4_EINKAUF)
    await einkauf.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "address", p_resource_id: a.id })
    const rest = await einkauf.from("addresses").update({ parent_address_id: c.id }).eq("id", a.id).select("id")
    expect(rest.error?.message).toMatch(/Zyklus/)
  })

  test("AC-25/26/Edge: Rechnungsempfänger, -versand and Abrechnungsgesellschaft are saved; self references are allowed; inactive ones are not offered", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const customer = await mkAddress(tenant, { name: "E2E Kunde Verweis" })
    const recipient = await mkAddress(tenant, { name: "E2E Empfänger Verweis" })
    const shipTo = await mkAddress(tenant, { name: "E2E Versand Verweis" })
    const billing = await mkAddress(tenant, { name: "E2E Abrechnung Verweis" })
    const inactive = await mkAddress(tenant, { name: "E2E Inaktiv Verweis", is_active: false })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, customer.id))
    await startEditing(page)
    await openTab(page, "Verknüpfungen")
    await pickAddress(page, "Rechnungsempfänger", recipient.number)
    await pickAddress(page, "Rechnungsversand an", shipTo.number)
    await pickAddress(page, "Abrechnungsgesellschaft", billing.number)
    // inactive addresses are not offered
    await combo(page, "Abrechnungsgesellschaft").click()
    await page.getByPlaceholder("Nummer, Name oder Kürzel suchen …").fill("Verweis")
    await expect(page.getByRole("option", { name: new RegExp(recipient.number) })).toBeVisible()
    await expect(page.getByRole("option", { name: new RegExp(inactive.number) })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()

    const { data } = await admin.from("addresses").select("invoice_recipient_id, invoice_ship_to_id, billing_company_id").eq("id", customer.id).single()
    expect(data).toEqual({ invoice_recipient_id: recipient.id, invoice_ship_to_id: shipTo.id, billing_company_id: billing.id })

    // self reference is allowed (= empty reference)
    await lockAddress(page, tenant, customer.id)
    const self = await page.request.patch(`/api/tenants/${tenant}/addresses/${customer.id}`, {
      data: await bodyOf(customer.id, { invoiceRecipientId: customer.id, invoiceShipToId: customer.id, billingCompanyId: customer.id }),
    })
    expect(self.status(), await self.text()).toBe(200)

    // an inactive address cannot be newly chosen (API) …
    await lockAddress(page, tenant, customer.id)
    const refused = await page.request.patch(`/api/tenants/${tenant}/addresses/${customer.id}`, {
      data: await bodyOf(customer.id, { billingCompanyId: inactive.id }),
    })
    expect(refused.status()).toBe(400)
    expect((await refused.json()).field).toBe("billingCompanyId")

    // … but an existing reference to an address that became inactive stays visible and saveable
    await admin.from("addresses").update({ billing_company_id: recipient.id }).eq("id", customer.id)
    await admin.from("addresses").update({ is_active: false }).eq("id", recipient.id)
    await page.goto(addressUrl(tenant, customer.id))
    await openTab(page, "Verknüpfungen")
    await expect(combo(page, "Abrechnungsgesellschaft")).toContainText("(inaktiv)")
    await startEditing(page)
    await openTab(page, "Stammdaten")
    await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill("E2E Kunde Verweis geändert")
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()
  })

  test("Edge: a reference into another tenant is refused (API and database)", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const foreign = await tenantId(P4_TENANT_FREMD)
    const mine = await mkAddress(tenant)
    const theirs = await mkAddress(foreign)
    await login(page, P4_EINKAUF)
    await lockAddress(page, tenant, mine.id)
    const res = await page.request.patch(`/api/tenants/${tenant}/addresses/${mine.id}`, {
      data: await bodyOf(mine.id, { parentAddressId: theirs.id }),
    })
    expect(res.status()).toBe(400)
    expect((await admin.from("addresses").select("parent_address_id").eq("id", mine.id).single()).data!.parent_address_id).toBeNull()
    const einkauf = await userClient(P4_EINKAUF)
    const rest = await einkauf.from("addresses").update({ invoice_recipient_id: theirs.id }).eq("id", mine.id).select("id")
    expect(rest.error?.code).toBe("23503")
  })
})

// =============================================================================================
test.describe("PROJ-4: Kontakte", () => {
  test("AC-27/28/29/30/31: create a contact (address preassigned), see parent contacts read-only, no child contacts, overall list", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const tag = uid(testInfo).replace(/[^a-z0-9]/g, "").slice(-6)
    const parent = await mkAddress(tenant, { name: `E2E Eltern ${tag}` })
    const child = await mkAddress(tenant, { name: `E2E Kind ${tag}`, parent_address_id: parent.id })
    const grandchild = await mkAddress(tenant, { name: `E2E Enkel ${tag}`, parent_address_id: child.id })
    const parentContact = await mkContact(tenant, parent.id, { last_name: `Zentrale${tag}`, first_name: "Zora" })
    const grandchildContact = await mkContact(tenant, grandchild.id, { last_name: `Enkelkontakt${tag}` })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, child.id))
    await openTab(page, "Kontakt")
    // inherited contact of the parent: read-only with source; the child's own list is empty
    const inheritedRow = page.getByRole("row", { name: new RegExp(`Zentrale${tag}`) })
    await expect(inheritedRow).toBeVisible()
    await expect(inheritedRow).toContainText(parent.number)
    await expect(inheritedRow).toContainText("nur lesbar")
    await expect(inheritedRow.getByRole("button")).toHaveCount(0)
    // contacts of subordinate addresses are not shown
    await expect(page.getByText(`Enkelkontakt${tag}`)).toHaveCount(0)

    // create: empty last name → validation error
    await page.getByRole("button", { name: "Kontakt anlegen" }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(`${child.number} – ${child.name}`)
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(dialog.getByText("Bitte den Nachnamen angeben")).toBeVisible()
    // invalid e-mail
    await dialog.getByLabel("Nachname").fill(`Eigen${tag}`)
    await dialog.getByLabel("E-Mail").fill("kaputt")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(dialog.getByText("Bitte eine gültige E-Mail-Adresse angeben")).toBeVisible()
    await dialog.getByLabel("E-Mail").fill("eigen@example.com")
    await dialog.getByLabel("Funktion / Position").fill("Einkauf")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(dialog).toBeHidden()
    // BUG-1: the address form is rebuilt after saving a contact and falls back to the first tab;
    // let that settle, then open the tab again (works the same once BUG-1 is fixed)
    await page.waitForTimeout(1500)
    await openTab(page, "Kontakt")
    const created = await admin.from("contacts").select("id, address_id, email").eq("tenant_id", tenant).eq("last_name", `Eigen${tag}`).single()
    createdContacts.push(created.data!.id)
    expect(created.data).toMatchObject({ address_id: child.id, email: "eigen@example.com" })
    const ownRow = page.getByRole("row", { name: new RegExp(`Eigen${tag}`) })
    await expect(ownRow).toContainText("Diese Adresse")

    // the grandchild sees contacts of child (own created) and parent, but not vice-versa
    await page.goto(addressUrl(tenant, grandchild.id))
    await openTab(page, "Kontakt")
    await expect(page.getByRole("row", { name: new RegExp(`Eigen${tag}`) })).toContainText("direkt übergeordnet")
    await expect(page.getByRole("row", { name: new RegExp(`Zentrale${tag}`) })).toContainText("2. Ebene darüber")
    await page.goto(addressUrl(tenant, parent.id))
    await openTab(page, "Kontakt")
    await expect(page.getByText(`Eigen${tag}`)).toHaveCount(0)
    await expect(page.getByText(`Enkelkontakt${tag}`)).toHaveCount(0)
    void parentContact
    void grandchildContact

    // overall list: finds contacts across addresses and shows the address per row
    await page.goto(`/kontakte?mandant=${tenant}&q=${tag}`)
    await expect(page.getByRole("row", { name: new RegExp(`Zentrale${tag}`) })).toContainText(parent.number)
    await expect(page.getByRole("row", { name: new RegExp(`Enkelkontakt${tag}`) })).toContainText(grandchild.number)
    await expect(page.getByRole("row", { name: new RegExp(`Eigen${tag}`) })).toContainText(child.number)
  })

  test("AC-32/Edge: a contact can be deactivated and reactivated, never deleted", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    const contact = await mkContact(tenant, address.id)

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Kontakt")
    await expect(page.getByRole("button", { name: /lösch/i })).toHaveCount(0)
    await page.getByRole("button", { name: new RegExp(`${contact.lastName} deaktivieren`) }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Deaktivieren", exact: true }).click()
    await expect(page.getByRole("row", { name: new RegExp(contact.lastName) })).toContainText("Inaktiv")
    expect((await admin.from("contacts").select("is_active").eq("id", contact.id).single()).data!.is_active).toBe(false)

    // the overall list marks it as inactive as well
    await page.goto(`/kontakte?mandant=${tenant}&q=${contact.lastName}`)
    await expect(page.getByRole("row", { name: new RegExp(contact.lastName) })).toContainText("Inaktiv")

    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Kontakt")
    await page.getByRole("button", { name: new RegExp(`${contact.lastName} aktivieren`) }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Aktivieren", exact: true }).click()
    await expect(page.getByRole("row", { name: new RegExp(contact.lastName) })).toContainText("Aktiv")

    // no delete: neither route nor direct REST
    const route = await page.request.delete(`/api/tenants/${tenant}/contacts/${contact.id}`)
    expect(route.status()).toBe(405)
    const einkauf = await userClient(P4_EINKAUF)
    expect((await einkauf.from("contacts").delete().eq("id", contact.id).select("id")).data ?? []).toHaveLength(0)
    expect((await admin.from("contacts").select("id").eq("id", contact.id)).data).toHaveLength(1)
  })

  test("AC-42b: the contact edit dialog is locked per contact; a second user is told who edits", async ({ page, browser }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    const contact = await mkContact(tenant, address.id, { last_name: `Sperre${Math.random().toString(36).slice(2, 6)}` })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Kontakt")
    await page.getByRole("button", { name: new RegExp(`${contact.lastName} bearbeiten`) }).click()
    await expect(page.getByRole("dialog").getByRole("button", { name: "Speichern" })).toBeVisible()
    expect((await admin.from("edit_locks").select("id").eq("resource_id", contact.id)).data).toHaveLength(1)

    const b = await otherSession(browser, testInfo, P4_EINKAUF2)
    try {
      await b.page.goto(addressUrl(tenant, address.id))
      await openTab(b.page, "Kontakt")
      await b.page.getByRole("button", { name: new RegExp(`${contact.lastName} bearbeiten`) }).click()
      const dialog = b.page.getByRole("dialog")
      await expect(dialog.getByText("Gesperrt – nur Lesezugriff")).toBeVisible()
      await expect(dialog.getByText(P4_EINKAUF)).toBeVisible()
      await expect(dialog.getByRole("button", { name: "Speichern" })).toHaveCount(0)
      await expect(dialog.getByLabel("Nachname")).toBeDisabled()
      // status change is blocked by the lock too
      const res = await b.page.request.patch(`/api/tenants/${tenant}/contacts/${contact.id}/status`, { data: { isActive: false } })
      expect(res.status(), await res.text()).toBe(409)
      expect((await res.json()).error).toContain(P4_EINKAUF)
      const save = await b.page.request.patch(`/api/tenants/${tenant}/contacts/${contact.id}`, { data: { lastName: "Fremd" } })
      expect(save.status()).toBe(409)
    } finally {
      await b.context.close()
    }
    // closing the dialog releases the lock
    await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click()
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", contact.id)).data?.length).toBe(0)
  })

  test("Edge: a contact cannot be created on a deactivated address; its address cannot be changed", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const inactive = await mkAddress(tenant, { is_active: false })
    const active = await mkAddress(tenant)
    const contact = await mkContact(tenant, active.id)
    await login(page, P4_EINKAUF)
    const res = await page.request.post(`/api/tenants/${tenant}/contacts`, { data: { addressId: inactive.id, lastName: "Neu" } })
    expect(res.status()).toBe(400)
    // moving a contact to another address through the database is refused
    const einkauf = await userClient(P4_EINKAUF)
    await einkauf.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "contact", p_resource_id: contact.id })
    const move = await einkauf.from("contacts").update({ address_id: inactive.id }).eq("id", contact.id).select("id")
    expect(move.error?.message).toMatch(/anderen Adresse/)
  })
})

// =============================================================================================
test.describe("PROJ-4: Deaktivieren / Reaktivieren", () => {
  test("AC-33: without the toggle right there is no Deaktivieren option (UI) and the API/database refuse it", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Deaktivieren", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Aktivieren", exact: true })).toHaveCount(0)

    const res = await page.request.patch(`/api/tenants/${tenant}/addresses/${address.id}/status`, { data: { isActive: false, includeChildren: true } })
    expect(res.status()).toBe(403)
    const einkauf = await userClient(P4_EINKAUF)
    expect((await einkauf.rpc("set_address_status", { p_tenant_id: tenant, p_address_id: address.id, p_is_active: false, p_include_children: false })).error?.code).toBe("42501")
    // direct is_active update is blocked for everybody, even with write access and a lock
    await einkauf.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "address", p_resource_id: address.id })
    const direct = await einkauf.from("addresses").update({ is_active: false }).eq("id", address.id).select("id")
    expect(direct.error?.code).toBe("42501")
    expect((await admin.from("addresses").select("is_active").eq("id", address.id).single()).data!.is_active).toBe(true)
  })

  test("AC-34/38: deactivating an address without children deactivates it and all its contacts; no delete exists", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    const c1 = await mkContact(tenant, address.id)
    const c2 = await mkContact(tenant, address.id)

    await login(page, P4_ADMIN)
    await page.goto(addressUrl(tenant, address.id))
    await expect(page.getByRole("button", { name: /lösch/i })).toHaveCount(0)
    await page.getByRole("button", { name: "Deaktivieren", exact: true }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByText("untergeordnete")).toHaveCount(0)
    await dialog.getByRole("button", { name: "Deaktivieren", exact: true }).click()
    await expect(page.getByText("Inaktiv").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Aktivieren", exact: true })).toBeVisible()
    expect((await admin.from("addresses").select("is_active").eq("id", address.id).single()).data!.is_active).toBe(false)
    const contacts = await admin.from("contacts").select("is_active").in("id", [c1.id, c2.id])
    expect(contacts.data!.every((c) => c.is_active === false)).toBe(true)

    // direct REST delete removes nothing; there is no DELETE route either
    const client = await userClient(P4_ADMIN)
    expect((await client.from("addresses").delete().eq("id", address.id).select("id")).data ?? []).toHaveLength(0)
    expect((await page.request.delete(`/api/tenants/${tenant}/addresses/${address.id}`)).status()).toBe(405)
    expect((await admin.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(1)
  })

  test("AC-35/36/37: cascade deactivation asks about children (Ja = all levels incl. contacts, Nein = only this); reactivation keeps contacts inactive", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    // tree 1: root → mid → leaf, each with a contact — answer "Ja"
    const root = await mkAddress(tenant, { name: "E2E Baum Wurzel" })
    const mid = await mkAddress(tenant, { name: "E2E Baum Mitte", parent_address_id: root.id })
    const leaf = await mkAddress(tenant, { name: "E2E Baum Blatt", parent_address_id: mid.id })
    const contacts = [await mkContact(tenant, root.id), await mkContact(tenant, mid.id), await mkContact(tenant, leaf.id)]
    // tree 2 — answer "Nein"
    const root2 = await mkAddress(tenant, { name: "E2E Baum2 Wurzel" })
    const kid2 = await mkAddress(tenant, { name: "E2E Baum2 Kind", parent_address_id: root2.id })
    const kidContact = await mkContact(tenant, kid2.id)
    const rootContact2 = await mkContact(tenant, root2.id)
    const states = async (ids: string[]) => {
      const rows = (await admin.from("addresses").select("id, is_active").in("id", ids)).data!
      return ids.map((id) => rows.find((r) => r.id === id)!.is_active)
    }

    await login(page, P4_ADMIN)

    // --- Ja
    await page.goto(addressUrl(tenant, root.id))
    await page.getByRole("button", { name: "Deaktivieren", exact: true }).click()
    let dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("1 aktive direkt untergeordnete Adresse")
    await dialog.getByRole("button", { name: "Ja, inklusive untergeordnete" }).click()
    await expect(page.getByRole("button", { name: "Aktivieren", exact: true })).toBeVisible()
    expect(await states([root.id, mid.id, leaf.id])).toEqual([false, false, false])
    expect((await admin.from("contacts").select("is_active").in("id", contacts.map((c) => c.id))).data!.every((c) => !c.is_active)).toBe(true)

    // --- reactivate with Ja: addresses active, contacts stay inactive
    await page.getByRole("button", { name: "Aktivieren", exact: true }).click()
    dialog = page.getByRole("alertdialog")
    await expect(dialog).toContainText("untergeordnete")
    await dialog.getByRole("button", { name: "Ja, inklusive untergeordnete" }).click()
    await expect(page.getByRole("button", { name: "Deaktivieren", exact: true })).toBeVisible()
    expect(await states([root.id, mid.id, leaf.id])).toEqual([true, true, true])
    expect((await admin.from("contacts").select("is_active").in("id", contacts.map((c) => c.id))).data!.every((c) => !c.is_active)).toBe(true)
    await openTab(page, "Kontakt")
    await expect(page.getByRole("row", { name: new RegExp(contacts[0].lastName) })).toContainText("Inaktiv")
    // … and can be activated one by one
    await page.getByRole("button", { name: new RegExp(`${contacts[0].lastName} aktivieren`) }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Aktivieren", exact: true }).click()
    await expect(page.getByRole("row", { name: new RegExp(contacts[0].lastName) })).toContainText("Aktiv")

    // --- Nein: only the selected address (and its contacts) is deactivated
    await page.goto(addressUrl(tenant, root2.id))
    await page.getByRole("button", { name: "Deaktivieren", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Nein, nur diese Adresse" }).click()
    await expect(page.getByRole("button", { name: "Aktivieren", exact: true })).toBeVisible()
    expect(await states([root2.id, kid2.id])).toEqual([false, true])
    expect((await admin.from("contacts").select("id, is_active").in("id", [rootContact2.id, kidContact.id])).data!.find((c) => c.id === rootContact2.id)!.is_active).toBe(false)
    expect((await admin.from("contacts").select("id, is_active").in("id", [rootContact2.id, kidContact.id])).data!.find((c) => c.id === kidContact.id)!.is_active).toBe(true)
  })

  test("Edge: cascade ignores locks on subordinate addresses but not the lock on the chosen address; it is all-or-nothing", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const root = await mkAddress(tenant)
    const kid = await mkAddress(tenant, { parent_address_id: root.id })
    const adminUser = (await admin.from("user_profiles").select("id").eq("username", P4_EINKAUF).single()).data!.id
    // a foreign lock on the child does not block the cascade
    await admin.from("edit_locks").insert({ tenant_id: tenant, resource_type: "address", resource_id: kid.id, user_id: adminUser, expires_at: new Date(Date.now() + 600e3).toISOString() })

    await login(page, P4_ADMIN)
    const ok = await page.request.patch(`/api/tenants/${tenant}/addresses/${root.id}/status`, { data: { isActive: false, includeChildren: true } })
    expect(ok.status(), await ok.text()).toBe(200)
    expect(await ok.json()).toMatchObject({ changedAddresses: 2 })
    expect((await admin.from("addresses").select("is_active").in("id", [root.id, kid.id])).data!.every((a) => !a.is_active)).toBe(true)

    // a foreign lock on the chosen address blocks it (409 naming the holder) and changes nothing
    await admin.from("edit_locks").insert({ tenant_id: tenant, resource_type: "address", resource_id: root.id, user_id: adminUser, expires_at: new Date(Date.now() + 600e3).toISOString() })
    const blocked = await page.request.patch(`/api/tenants/${tenant}/addresses/${root.id}/status`, { data: { isActive: true, includeChildren: true } })
    expect(blocked.status()).toBe(409)
    expect((await blocked.json()).error).toContain(P4_EINKAUF)
    expect((await admin.from("addresses").select("is_active").in("id", [root.id, kid.id])).data!.every((a) => !a.is_active)).toBe(true)
  })

  test("AC-40: a deactivated address keeps its Kürzel for the duplicate hint", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const code = `D${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
    const old = await mkAddress(tenant, { code, is_active: false })
    await login(page, P4_EINKAUF)
    const res = await page.request.get(`/api/tenants/${tenant}/addresses/code-check?code=${code}`)
    expect((await res.json()).items.map((i: { addressNumber: string }) => i.addressNumber)).toEqual([old.number])
  })

  test("Edge: deactivation of a large hierarchy (deep chain) is complete and quick", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const ids: string[] = []
    let parent: string | null = null
    for (let i = 0; i < 40; i++) {
      const a = await mkAddress(tenant, parent ? { parent_address_id: parent } : {})
      ids.push(a.id)
      parent = a.id
    }
    await login(page, P4_ADMIN)
    const started = Date.now()
    const res = await page.request.patch(`/api/tenants/${tenant}/addresses/${ids[0]}/status`, { data: { isActive: false, includeChildren: true } })
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).changedAddresses).toBe(40)
    expect(Date.now() - started).toBeLessThan(5000)
    expect((await admin.from("addresses").select("is_active").in("id", ids)).data!.every((a) => !a.is_active)).toBe(true)
  })
})

// =============================================================================================
test.describe("PROJ-4: Rechte, Sperre, Mandanten", () => {
  test("AC-41: a read-only user (Lager) gets no edit option, no create button and no contact actions", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    const contact = await mkContact(tenant, address.id)

    await login(page, P4_LAGER)
    await page.goto(`/adressen?mandant=${tenant}&q=${address.base}`)
    await expect(page.getByRole("link", { name: address.number })).toBeVisible()
    await expect(page.getByRole("link", { name: "Adresse anlegen" })).toHaveCount(0)

    await page.goto(addressUrl(tenant, address.id))
    await expect(page.getByText("Nur Lesezugriff")).toBeVisible()
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Deaktivieren", exact: true })).toHaveCount(0)
    await expect(page.getByLabel("Adressnummer-Basis")).toBeDisabled()
    await openTab(page, "Kontakt")
    await expect(page.getByRole("button", { name: "Kontakt anlegen" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: new RegExp(`${contact.lastName} (bearbeiten|deaktivieren)`) })).toHaveCount(0)
    // the contact can be viewed read-only
    await page.getByRole("button", { name: contact.lastName }).click()
    await expect(page.getByRole("dialog").getByLabel("Nachname")).toBeDisabled()
    await expect(page.getByRole("dialog").getByRole("button", { name: "Speichern" })).toHaveCount(0)
    expect((await admin.from("edit_locks").select("id").eq("resource_id", contact.id)).data).toHaveLength(0)
    await page.getByRole("dialog").getByRole("button", { name: "Schließen" }).click()

    // Kontakte-Gesamtliste: no actions
    await page.goto(`/kontakte?mandant=${tenant}&q=${contact.lastName}`)
    await expect(page.getByRole("row", { name: new RegExp(contact.lastName) })).toBeVisible()
    await expect(page.getByRole("button", { name: /bearbeiten|deaktivieren/ })).toHaveCount(0)

    // API refuses writes
    expect((await page.request.post(`/api/tenants/${tenant}/addresses`, { data: { addressBase: randomBase(), suffix: "0001", name: "x" } })).status()).toBe(403)
    expect((await page.request.post(`/api/tenants/${tenant}/contacts`, { data: { addressId: address.id, lastName: "x" } })).status()).toBe(403)
    expect((await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "address", resourceId: address.id } })).status()).toBe(403)
  })

  test("Edge: without read access to Kontakte the tab is hidden; without Adressen the pages deny access", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)

    await login(page, P4_LAGER_OHNE_KONTAKTE)
    await page.goto(addressUrl(tenant, address.id))
    await expect(page.getByRole("tab", { name: "Stammdaten" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Kontakt" })).toHaveCount(0)
    expect((await page.request.get(`/api/tenants/${tenant}/addresses/${address.id}/contacts`)).status()).toBe(403)
    await page.goto(`/kontakte?mandant=${tenant}`)
    await expect(page.getByText(/keinen Zugriff|Zugriff auf die Kontakte/).first()).toBeVisible()

    // user with only Artikelstamm: no access to the address pages, but can choose a Markeninhaber
    await page.context().clearCookies()
    await login(page, P4_NUR_ARTIKEL)
    await page.goto(`/adressen?mandant=${tenant}`)
    await expect(page.getByText(/Zugriff auf die Adressen/)).toBeVisible()
    await page.goto(addressUrl(tenant, address.id))
    await expect(page.getByText(/Zugriff auf die Adressen/)).toBeVisible()
    const opts = await page.request.get(`/api/tenants/${tenant}/addresses/options?q=${address.base}`)
    expect(opts.status()).toBe(200)

    // user without any Warenwirtschaft mask: nothing reachable
    await page.context().clearCookies()
    await login(page, P4_OHNE)
    for (const path of ["/adressen", "/kontakte", `/adressen/${address.id}`, "/adressen/neu", "/merkmale/laender"]) {
      await page.goto(`${path}${path.includes("?") ? "&" : "?"}mandant=${tenant}`)
      await expect(page.getByText(/Zugriff auf|fehlt das Recht/).first(), path).toBeVisible()
    }
    expect((await page.request.get(`/api/tenants/${tenant}/addresses/options`)).status()).toBe(403)
  })

  test("AC-31 (Entscheidung 2026-10-08): the address column of the overall contact list needs read access to Adressen", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Nur-Kontakte Adresse" })
    const contact = await mkContact(tenant, address.id)
    // Kontakte-only: contact visible, address not (separate mask, personal data stays separated)
    await login(page, P4_NUR_KONTAKTE)
    await page.goto(`/kontakte?mandant=${tenant}&q=${contact.lastName}`)
    const row = page.getByRole("row", { name: new RegExp(contact.lastName) })
    await expect(row).toBeVisible()
    await expect(row).not.toContainText(address.number)
    // with read access to Adressen the address is shown
    await page.context().clearCookies()
    await login(page, P4_LAGER)
    await page.goto(`/kontakte?mandant=${tenant}&q=${contact.lastName}`)
    await expect(page.getByRole("row", { name: new RegExp(contact.lastName) })).toContainText(address.number)
  })

  test("AC-42: while A edits, B only gets read access and the message names A", async ({ page, browser }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Sperre Adresse" })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)

    const b = await otherSession(browser, testInfo, P4_EINKAUF2)
    try {
      await b.page.goto(addressUrl(tenant, address.id))
      await expect(b.page.getByText("Gesperrt – nur Lesezugriff")).toBeVisible()
      await expect(b.page.getByText(P4_EINKAUF).first()).toBeVisible()
      await b.page.getByRole("button", { name: "Bearbeiten" }).click()
      await expect(b.page.getByText("Bearbeiten nicht möglich")).toBeVisible()
      await expect(b.page.getByRole("button", { name: "Speichern" })).toHaveCount(0)
      await expect(b.page.getByRole("textbox", { name: /^Name \/ Firma/ })).toBeDisabled()

      // not by API either
      const res = await b.page.request.patch(`/api/tenants/${tenant}/addresses/${address.id}`, {
        data: await bodyOf(address.id, { name: "Fremd" }),
      })
      expect(res.status()).toBe(409)
      expect((await res.json()).error).toContain(P4_EINKAUF)
      // … and the admin (with toggle right) cannot deactivate it either
      const status = await b.page.request.patch(`/api/tenants/${tenant}/addresses/${address.id}/status`, { data: { isActive: false } })
      expect([403, 409]).toContain(status.status())
    } finally {
      await b.context.close()
    }
    await page.getByRole("button", { name: "Abbrechen" }).click()
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", address.id)).data?.length).toBe(0)
  })

  test("BUG-2: the message for a locked Adresse is grammatically correct ('Die Adresse …')", async ({ page, browser }, testInfo) => {
    
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)
    const b = await otherSession(browser, testInfo, P4_EINKAUF2)
    try {
      const res = await b.page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "address", resourceId: address.id } })
      expect(res.status()).toBe(409)
      expect((await res.json()).error).toMatch(/^Die Adresse wird gerade von/)
      await b.page.goto(addressUrl(tenant, address.id))
      await expect(b.page.getByText(/Die Adresse wird gerade von/)).toBeVisible()
    } finally {
      await b.context.close()
    }
  })

  test("AC-43: after 15 minutes without activity the address lock is released automatically", async ({ page, browser }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Timeout Adresse" })

    await page.clock.install()
    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)
    await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill("Ungespeicherte Änderung")
    expect((await admin.from("edit_locks").select("id").eq("resource_id", address.id)).data).toHaveLength(1)

    await page.clock.fastForward("14:00")
    await expect(page.getByText("Sperre läuft bald ab")).toBeVisible()
    await page.waitForTimeout(1500)
    await page.clock.fastForward("02:00")
    await expect(page.getByText("Bearbeitungssperre abgelaufen")).toBeVisible()
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", address.id)).data?.length).toBe(0)
    await expect(page.getByRole("textbox", { name: /^Name \/ Firma/ })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled()

    // meanwhile B takes the lock → A re-locking is refused and names B
    const b = await otherSession(browser, testInfo, P4_EINKAUF2)
    try {
      await b.page.goto(addressUrl(tenant, address.id))
      await startEditing(b.page)
      await page.getByRole("button", { name: "Erneut sperren" }).click()
      await expect(page.getByText(P4_EINKAUF2).first()).toBeVisible()
      await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled()
    } finally {
      await b.context.close()
    }
  })

  test("AC-44a: logging out with unsaved address changes asks first; cancel keeps the edit state, discard logs out without saving", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Logout Adresse" })

    await login(page, await mkUserWithRole(testInfo, "Einkauf"))
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)
    await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill("E2E Logout Adresse geändert")

    await openUserMenu(page)
    await page.getByRole("menuitem", { name: "Abmelden" }).click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog.getByText("Ungespeicherte Änderungen")).toBeVisible()
    await dialog.getByRole("button", { name: "Abbrechen" }).click()
    await expect(page).toHaveURL(new RegExp(`/adressen/${address.id}`))
    // getByLabel: on mobile the sidebar sheet stays open and hides the page from role queries
    await expect(page.getByLabel(/^Name \/ Firma/)).toHaveValue("E2E Logout Adresse geändert")

    await openUserMenu(page)
    await page.getByRole("menuitem", { name: "Abmelden" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Verwerfen & abmelden" }).click()
    await expect(page).toHaveURL(/\/login/)
    expect((await admin.from("addresses").select("name").eq("id", address.id).single()).data!.name).toBe("E2E Logout Adresse")
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", address.id)).data?.length).toBe(0)
  })

  test("AC-44b: 'Speichern & abmelden' saves the address changes first", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Logout Save" })

    await login(page, await mkUserWithRole(testInfo, "Einkauf"))
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)
    await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill("E2E gespeichert beim Logout")
    await openUserMenu(page)
    await page.getByRole("menuitem", { name: "Abmelden" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Speichern & abmelden" }).click()
    await expect(page).toHaveURL(/\/login/)
    expect((await admin.from("addresses").select("name").eq("id", address.id).single()).data!.name).toBe("E2E gespeichert beim Logout")
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", address.id)).data?.length).toBe(0)
  })

  test("AC-44c: the contact dialog asks before discarding unsaved input (Abbrechen) and releases its lock", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    const contact = await mkContact(tenant, address.id, { last_name: "LogoutKontakt" })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Kontakt")
    await page.getByRole("button", { name: /LogoutKontakt bearbeiten/ }).click()
    const contactDialog = page.getByRole("dialog")
    await contactDialog.getByLabel("Nachname").fill("LogoutKontaktNeu")
    await contactDialog.getByRole("button", { name: "Abbrechen" }).click()
    await expect(page.getByRole("alertdialog").getByText("Änderungen verwerfen?")).toBeVisible()
    await page.getByRole("alertdialog").getByRole("button", { name: "Verwerfen" }).click()
    await expect(contactDialog).toBeHidden()
    expect((await admin.from("contacts").select("last_name").eq("id", contact.id).single()).data!.last_name).toBe("LogoutKontakt")
    await expect.poll(async () => (await admin.from("edit_locks").select("id").eq("resource_id", contact.id)).data?.length).toBe(0)
  })

  test("AC-45: users only see addresses, contacts and countries of their own tenant", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const foreign = await tenantId(P4_TENANT_FREMD)
    const mine = await mkAddress(tenant, { name: "E2E Mandant Eigen" })
    const theirs = await mkAddress(foreign, { name: "E2E Mandant Fremd" })
    const theirContact = await mkContact(foreign, theirs.id, { last_name: "FremdKontakt" })
    const { data: fc } = await admin.from("countries").insert({ tenant_id: foreign, code: "FR", name: "Fremdland" }).select("id").single()
    createdCountries.push(fc!.id)

    await login(page, P4_EINKAUF)
    await page.goto(`/adressen?mandant=${tenant}&q=E2E+Mandant`)
    await expect(page.getByRole("link", { name: mine.number })).toBeVisible()
    await expect(page.getByText("E2E Mandant Fremd")).toHaveCount(0)
    // asking for the foreign tenant falls back; the foreign address is not reachable
    await page.goto(`/adressen?mandant=${foreign}&q=E2E+Mandant`)
    await expect(page.getByText("E2E Mandant Fremd")).toHaveCount(0)
    await page.goto(addressUrl(foreign, theirs.id))
    await expect(page.getByText("Adresse nicht gefunden")).toBeVisible()
    await page.goto(addressUrl(tenant, theirs.id))
    await expect(page.getByText("Adresse nicht gefunden")).toBeVisible()
    await page.goto(`/kontakte?mandant=${foreign}&q=FremdKontakt`)
    await expect(page.getByText("FremdKontakt")).toHaveCount(0)
    await page.goto(`/merkmale/laender?mandant=${foreign}`)
    await expect(page.getByText("Fremdland")).toHaveCount(0)

    // APIs against the foreign tenant are forbidden, with a foreign id in the own tenant: nothing leaks
    for (const [method, path, data] of [
      ["post", `/api/tenants/${foreign}/addresses`, { addressBase: randomBase(), suffix: "0001", name: "x" }],
      ["patch", `/api/tenants/${foreign}/addresses/${theirs.id}/status`, { isActive: false }],
      ["post", `/api/tenants/${foreign}/contacts`, { addressId: theirs.id, lastName: "x" }],
      ["get", `/api/tenants/${foreign}/addresses/options`, undefined],
      ["get", `/api/tenants/${foreign}/addresses/${theirs.id}/contacts`, undefined],
    ] as const) {
      const res = await page.request[method](path, { data })
      expect(res.status(), `${method} ${path}`).toBe(403)
    }
    const own = await page.request.get(`/api/tenants/${tenant}/addresses/${theirs.id}/contacts`)
    expect(await own.json()).toEqual({ own: [], inherited: [] })
    const ownPatch = await page.request.patch(`/api/tenants/${tenant}/addresses/${theirs.id}/status`, { data: { isActive: false } })
    expect(ownPatch.status()).toBe(403) // Einkauf has no toggle right
    // an admin WITH the toggle right in the own tenant still cannot reach the foreign address
    await page.context().clearCookies()
    await login(page, P4_ADMIN)
    const adminPatch = await page.request.patch(`/api/tenants/${tenant}/addresses/${theirs.id}/status`, { data: { isActive: false, includeChildren: true } })
    expect(adminPatch.status()).toBe(404)
    expect((await admin.from("addresses").select("is_active").eq("id", theirs.id).single()).data!.is_active).toBe(true)
    const contactPost = await page.request.post(`/api/tenants/${tenant}/contacts`, { data: { addressId: theirs.id, lastName: "Eindringling" } })
    expect(contactPost.status()).toBeGreaterThanOrEqual(400)
    const optionHits = await (await page.request.get(`/api/tenants/${tenant}/addresses/options?q=E2E+Mandant+Fremd`)).json()
    expect(optionHits.items).toHaveLength(0)
    void theirContact
  })
})

// =============================================================================================
test.describe("PROJ-4: Liste und Suche", () => {
  test("AC-46/47: server-side search over number, name, addition, Kürzel, GLN, city and PLZ; role and status filters", async ({ page }, testInfo) => {
    const tenant = await tenantId(P4_TENANT)
    const tag = uid(testInfo).replace(/[^a-z0-9]/g, "").slice(-7)
    const gln = String(Math.floor(1e12 + Math.random() * 8.9e12))
    const target = await mkAddress(tenant, {
      name: `Suchfirma ${tag}`,
      name_addition: `Zusatz${tag}`,
      code: `KZ${tag.slice(0, 5)}`.toUpperCase(),
      gln,
      city: `Ort${tag}`,
      postal_code: `P${tag.slice(0, 4)}`,
      roles: ["delivery_address"],
    })
    const other = await mkAddress(tenant, { name: `Suchfirma andere ${tag}`, roles: ["customer"] })
    const inactive = await mkAddress(tenant, { name: `Suchfirma inaktiv ${tag}`, roles: ["delivery_address"], is_active: false })

    await login(page, P4_EINKAUF)
    for (const term of [target.number, target.base, `Zusatz${tag}`, `ort${tag}`, `KZ${tag.slice(0, 5)}`, gln, `P${tag.slice(0, 4)}`]) {
      await page.goto(`/adressen?mandant=${tenant}&q=${encodeURIComponent(term)}`)
      await expect(page.getByRole("link", { name: target.number }), term).toBeVisible()
    }

    // role filter + default status filter "Aktiv"
    await page.goto(`/adressen?mandant=${tenant}&q=${tag}`)
    await expect(page.getByRole("link", { name: target.number })).toBeVisible()
    await expect(page.getByRole("link", { name: other.number })).toBeVisible()
    await expect(page.getByRole("link", { name: inactive.number })).toHaveCount(0)
    await page.goto(`/adressen?mandant=${tenant}&q=${tag}&rolle=delivery_address`)
    await expect(page.getByRole("link", { name: target.number })).toBeVisible()
    await expect(page.getByRole("link", { name: other.number })).toHaveCount(0)
    await page.goto(`/adressen?mandant=${tenant}&q=${tag}&rolle=delivery_address&status=alle`)
    await expect(page.getByRole("link", { name: inactive.number })).toBeVisible()
    await page.goto(`/adressen?mandant=${tenant}&q=${tag}&status=inaktiv`)
    await expect(page.getByRole("link", { name: inactive.number })).toBeVisible()
    await expect(page.getByRole("link", { name: target.number })).toHaveCount(0)

    // UI: the filter controls drive the URL
    await page.goto(`/adressen?mandant=${tenant}`)
    await page.getByLabel("Suche").fill(tag)
    await expect(page).toHaveURL(new RegExp(`q=${tag}`))
    await expect(page.getByRole("link", { name: target.number })).toBeVisible()
  })

  test("AC-46b: the list is paginated on the server", async ({ page }, testInfo) => {
    const t = await mkTenantWithUser(testInfo, [["adressen", "read"]])
    const rows = Array.from({ length: 27 }, (_, i) => ({
      tenant_id: t.tenant,
      address_base: String(100 + i),
      address_suffix: "0001",
      name: `Seite ${String(i).padStart(2, "0")}`,
    }))
    const { data, error } = await admin.from("addresses").insert(rows).select("id")
    expect(error).toBeNull()
    createdAddresses.push(...data!.map((r) => r.id))

    await login(page, t.username)
    await page.goto(`/adressen?mandant=${t.tenant}`)
    await expect(page.getByRole("row")).toHaveCount(26) // header + 25
    await expect(page.getByText(/27/).first()).toBeVisible()
    await page.goto(`/adressen?mandant=${t.tenant}&seite=2`)
    await expect(page.getByRole("row")).toHaveCount(3) // header + 2
    // out-of-range / garbage page numbers do not crash
    for (const p of ["0", "-3", "abc", "99999"]) {
      const res = await page.goto(`/adressen?mandant=${t.tenant}&seite=${p}`)
      expect(res!.status(), p).toBeLessThan(500)
    }
  })

  test("AC-48: empty list: 'Noch keine Adressen angelegt' with a create button only for writers", async ({ page }, testInfo) => {
    const empty = await tenantId(P4_TENANT_LEER)
    await login(page, P4_LEER)
    await page.goto(`/adressen?mandant=${empty}`)
    await expect(page.getByText("Noch keine Adressen angelegt", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Adresse anlegen" }).first()).toBeVisible()

    const reader = await mkTenantWithUser(testInfo, [["adressen", "read"]])
    await page.context().clearCookies()
    await login(page, reader.username)
    await page.goto(`/adressen?mandant=${reader.tenant}`)
    await expect(page.getByText("Noch keine Adressen angelegt", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Adresse anlegen" })).toHaveCount(0)
  })

  test("Edge: roles are shown as badges; Land is shown as Kürzel in the list", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const country = await countryId(tenant, "DE")
    const address = await mkAddress(tenant, { roles: ["customer", "supplier"], country_id: country, city: "Hamburg" })
    await login(page, P4_EINKAUF)
    await page.goto(`/adressen?mandant=${tenant}&q=${address.base}`)
    const row = page.getByRole("row", { name: new RegExp(address.number) })
    await expect(row).toContainText("Kunde")
    await expect(row).toContainText("Lieferant")
    await expect(row).toContainText("DE")
    await expect(row).toContainText("Hamburg")
    // filter by Land via URL
    await page.goto(`/adressen?mandant=${tenant}&q=${address.base}&land=${country}`)
    await expect(page.getByRole("link", { name: address.number })).toBeVisible()
    await page.goto(`/adressen?mandant=${tenant}&q=${address.base}&land=${await countryId(tenant, "AT")}`)
    await expect(page.getByRole("link", { name: address.number })).toHaveCount(0)
  })
})

// =============================================================================================
test.describe("PROJ-4: Rollen-Dialog (PROJ-2 Erweiterung) – Zusatzrecht aktivieren/deaktivieren", () => {
  test("the switch appears only for the mask Adressen, needs 'Lesen + Bearbeiten' and is stored", async ({ page }, testInfo) => {
    const nord = (await admin.from("tenants").select("id").eq("name", P2_TENANT_NORD).single()).data!.id as string
    await login(page, P2_TENANT_ADMIN, P2_PASSWORD)
    await page.goto(`/benutzerverwaltung?mandant=${nord}`)
    await page.getByRole("tab", { name: /Rollen/ }).click()
    await page.getByRole("button", { name: "Neue Rolle" }).click()
    const dialog = page.getByRole("dialog")
    const roleName = `E2E P4 ${uid(testInfo)}`
    await dialog.getByLabel("Name", { exact: false }).first().fill(roleName)

    await expect(dialog.getByText("Darf Adressen aktivieren/deaktivieren")).toBeVisible()
    await expect(dialog.getByText("Darf Kontakte aktivieren/deaktivieren")).toHaveCount(0)
    await expect(dialog.getByText("Darf Länder aktivieren/deaktivieren")).toHaveCount(0)
    await expect(dialog.getByText("Darf Artikelstamm aktivieren/deaktivieren")).toHaveCount(0)
    // the removed Merkmal mask is gone, the new masks are there
    await expect(dialog.getByRole("combobox", { name: "Markeninhaber" })).toHaveCount(0)
    await expect(dialog.getByRole("combobox", { name: "Adressen", exact: true })).toBeVisible()
    await expect(dialog.getByRole("combobox", { name: "Kontakte", exact: true })).toBeVisible()
    await expect(dialog.getByRole("combobox", { name: "Länder", exact: true })).toBeVisible()

    // the switch is disabled until the mask is set to "Lesen + Bearbeiten"
    const toggle = dialog.getByRole("switch", { name: /Darf Adressen aktivieren/ })
    await expect(toggle).toBeDisabled()
    await dialog.getByRole("combobox", { name: "Adressen", exact: true }).click()
    await page.getByRole("option", { name: "Lesen", exact: true }).click()
    await expect(toggle).toBeDisabled()
    await dialog.getByRole("combobox", { name: "Adressen", exact: true }).click()
    await page.getByRole("option", { name: "Lesen + Bearbeiten" }).click()
    await expect(toggle).toBeEnabled()
    await toggle.click()
    await dialog.getByRole("button", { name: /Speichern|Anlegen|Rolle anlegen/ }).click()
    await expect(dialog).toBeHidden()

    const { data: role } = await admin.from("roles").select("id").eq("tenant_id", nord).eq("name", roleName).single()
    createdRoles.push(role!.id)
    const perm = await admin.from("role_permissions").select("access_level, can_toggle_active").eq("role_id", role!.id).eq("maske", "adressen").single()
    expect(perm.data).toEqual({ access_level: "write", can_toggle_active: true })
  })

  test("Security: the toggle right cannot be stored without write access; the database refuses it", async () => {
    const tenant = await tenantId(P4_TENANT)
    const { data: role } = await admin.from("roles").select("id").eq("tenant_id", tenant).eq("name", "Lager").single()
    const bad = await admin.from("role_permissions").update({ can_toggle_active: true }).eq("role_id", role!.id).eq("maske", "adressen").select("id")
    expect(bad.error?.code).toBe("23514")
  })
})

// =============================================================================================
test.describe("PROJ-4: Security", () => {
  test("unauthenticated requests are rejected (401) and pages redirect to the login", async ({ page, request }) => {
    const tenant = await tenantId(P4_TENANT)
    const id = "11111111-1111-4111-8111-111111111111"
    for (const [method, path, data] of [
      ["post", `/api/tenants/${tenant}/addresses`, { addressBase: "1", suffix: "0001", name: "x" }],
      ["patch", `/api/tenants/${tenant}/addresses/${id}`, { addressBase: "1", suffix: "0001", name: "x" }],
      ["patch", `/api/tenants/${tenant}/addresses/${id}/status`, { isActive: false }],
      ["get", `/api/tenants/${tenant}/addresses/${id}/contacts`, undefined],
      ["get", `/api/tenants/${tenant}/addresses/options`, undefined],
      ["get", `/api/tenants/${tenant}/addresses/next-suffix?base=1`, undefined],
      ["get", `/api/tenants/${tenant}/addresses/code-check?code=A`, undefined],
      ["post", `/api/tenants/${tenant}/contacts`, { addressId: id, lastName: "x" }],
      ["patch", `/api/tenants/${tenant}/contacts/${id}`, { lastName: "x" }],
      ["patch", `/api/tenants/${tenant}/contacts/${id}/status`, { isActive: false }],
      ["post", `/api/tenants/${tenant}/merkmale/laender`, { code: "XX", name: "x" }],
      ["post", `/api/tenants/${tenant}/locks`, { resourceType: "address", resourceId: id }],
    ] as const) {
      const res = await request[method](path, { data, maxRedirects: 0 })
      expect(res.status(), `${method} ${path}`).toBe(401)
    }
    for (const path of ["/adressen", `/adressen/${id}`, "/adressen/neu", "/kontakte", "/merkmale/laender"]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    }
  })

  test("direct database access (PostgREST with a user token) honours rights, tenants, status function and computed columns", async () => {
    const tenant = await tenantId(P4_TENANT)
    const foreign = await tenantId(P4_TENANT_FREMD)
    const address = await mkAddress(tenant, { name: "E2E RLS" })
    const contact = await mkContact(tenant, address.id)
    const theirs = await mkAddress(foreign, { name: "E2E RLS Fremd" })
    const lager = await userClient(P4_LAGER)
    const lagerOhne = await userClient(P4_LAGER_OHNE_KONTAKTE)
    const nurKontakte = await userClient(P4_NUR_KONTAKTE)
    const nurArtikel = await userClient(P4_NUR_ARTIKEL)
    const einkauf = await userClient(P4_EINKAUF)
    const einkauf2 = await userClient(P4_EINKAUF2)
    const fremd = await userClient(P4_FREMD)
    const ohne = await userClient(P4_OHNE)

    // --- reading
    expect((await lager.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(1)
    expect((await lager.from("contacts").select("id").eq("id", contact.id)).data).toHaveLength(1)
    expect((await lagerOhne.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(1)
    expect((await lagerOhne.from("contacts").select("id").eq("id", contact.id)).data).toHaveLength(0)
    expect((await nurKontakte.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(0)
    expect((await nurKontakte.from("contacts").select("id").eq("id", contact.id)).data).toHaveLength(1)
    // Artikelstamm readers see addresses (for Markeninhaber), never contacts
    expect((await nurArtikel.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(1)
    expect((await nurArtikel.from("contacts").select("id").eq("id", contact.id)).data).toHaveLength(0)
    expect((await ohne.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(0)
    expect((await ohne.from("countries").select("id").eq("tenant_id", tenant)).data).toHaveLength(0)
    expect((await fremd.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(0)
    expect((await fremd.from("contacts").select("id").eq("id", contact.id)).data).toHaveLength(0)
    expect((await einkauf.from("addresses").select("id").eq("id", theirs.id)).data).toHaveLength(0)
    expect((await lager.from("countries").select("id").eq("tenant_id", tenant)).data!.length).toBeGreaterThan(0)

    // --- writing without rights
    const base = randomBase()
    const ins = { tenant_id: tenant, address_base: base, address_suffix: "0001", name: "Hack" }
    expect((await lager.from("addresses").insert(ins)).error).not.toBeNull()
    expect((await fremd.from("addresses").insert(ins)).error).not.toBeNull()
    expect((await ohne.from("addresses").insert(ins)).error).not.toBeNull()
    expect((await lager.from("addresses").update({ name: "Hack" }).eq("id", address.id).select("id")).data ?? []).toHaveLength(0)
    expect((await lager.from("contacts").update({ last_name: "Hack" }).eq("id", contact.id).select("id")).data ?? []).toHaveLength(0)
    expect((await lager.from("contacts").insert({ tenant_id: tenant, address_id: address.id, last_name: "Hack" })).error).not.toBeNull()
    expect((await lager.from("countries").insert({ tenant_id: tenant, code: "HK", name: "Hack" })).error).not.toBeNull()
    expect((await einkauf.from("countries").insert({ tenant_id: tenant, code: "HK", name: "Hack" })).error).not.toBeNull() // Länder only read
    // an Adressen-writer without Kontakte write (none exists) / Kontakte-only cannot write addresses
    expect((await nurKontakte.from("addresses").update({ name: "Hack" }).eq("id", address.id).select("id")).data ?? []).toHaveLength(0)

    // --- tenant hopping
    const move = await einkauf.from("addresses").update({ tenant_id: foreign }).eq("id", address.id).select("id")
    expect(move.error !== null || (move.data ?? []).length === 0).toBe(true)
    expect((await einkauf.from("addresses").insert({ ...ins, tenant_id: foreign })).error).not.toBeNull()
    expect((await fremd.from("contacts").insert({ tenant_id: foreign, address_id: address.id, last_name: "Hack" })).error).not.toBeNull()

    // --- RPC functions respect rights and tenants
    expect((await fremd.rpc("set_address_status", { p_tenant_id: tenant, p_address_id: address.id, p_is_active: false, p_include_children: true })).error?.code).toBe("42501")
    expect((await ohne.rpc("set_address_status", { p_tenant_id: tenant, p_address_id: address.id, p_is_active: false, p_include_children: true })).error?.code).toBe("42501")
    expect((await lager.rpc("set_address_status", { p_tenant_id: tenant, p_address_id: address.id, p_is_active: false, p_include_children: true })).error?.code).toBe("42501")
    expect((await einkauf.rpc("address_options", { p_tenant_id: foreign, p_q: "E2E" })).data ?? []).toHaveLength(0)
    expect((await fremd.rpc("address_options", { p_tenant_id: tenant, p_q: "E2E RLS" })).data ?? []).toHaveLength(0)
    expect((await fremd.rpc("address_contacts", { p_tenant_id: tenant, p_address_id: address.id })).data ?? []).toHaveLength(0)
    expect((await lagerOhne.rpc("address_contacts", { p_tenant_id: tenant, p_address_id: address.id })).data ?? []).toHaveLength(0)
    expect((await fremd.rpc("address_subtree", { p_tenant_id: tenant, p_address_id: address.id })).data ?? []).toHaveLength(0)
    // admin-only helper is not callable by clients
    expect((await einkauf.rpc("address_subtree_definer", { p_tenant_id: tenant, p_address_id: address.id })).error).not.toBeNull()
    // the toggle right of another tenant's admin does not help here
    expect((await fremd.rpc("set_address_status", { p_tenant_id: foreign, p_address_id: address.id, p_is_active: false, p_include_children: false })).error?.code).toBe("P0002")
    expect((await admin.from("addresses").select("is_active").eq("id", address.id).single()).data!.is_active).toBe(true)

    // --- locks block writes of others; client-supplied computed/audit columns are overwritten
    const got = await einkauf.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "address", p_resource_id: address.id })
    expect(got.data![0].out_acquired).toBe(true)
    expect((await einkauf2.rpc("acquire_edit_lock", { p_tenant_id: tenant, p_resource_type: "address", p_resource_id: address.id })).data![0]).toMatchObject({ out_acquired: false, out_holder_username: P4_EINKAUF })
    const blocked = await einkauf2.from("addresses").update({ name: "B darf nicht" }).eq("id", address.id).select("id")
    expect(blocked.error?.code).toBe("55P03")
    const ok = await einkauf
      .from("addresses")
      .update({ name: "A darf", address_number: "FAKE.0000", search_text: "fake", created_by: null, tenant_id: tenant })
      .eq("id", address.id)
      .select("address_number, search_text, name")
    expect(ok.error).toBeNull()
    expect(ok.data![0].address_number).toBe(address.number)
    expect(ok.data![0].search_text).toContain("A darf")
    expect(ok.data![0].search_text).not.toContain("fake")
    // no lock at all → refused ("Sperre abgelaufen")
    await einkauf.rpc("release_edit_lock", { p_tenant_id: tenant, p_resource_type: "address", p_resource_id: address.id })
    const nolock = await einkauf.from("addresses").update({ name: "ohne Sperre" }).eq("id", address.id).select("id")
    expect(nolock.error?.code).toBe("55P03")

    // --- hard delete is impossible for everybody
    for (const client of [einkauf, lager, fremd]) {
      expect((await client.from("addresses").delete().eq("id", address.id).select("id")).data ?? []).toHaveLength(0)
      expect((await client.from("contacts").delete().eq("id", contact.id).select("id")).data ?? []).toHaveLength(0)
      expect((await client.from("countries").delete().eq("tenant_id", tenant).select("id")).data ?? []).toHaveLength(0)
    }
    expect((await admin.from("addresses").select("id").eq("id", address.id)).data).toHaveLength(1)
  })

  test("the database refuses invalid data even when the API is bypassed", async () => {
    const tenant = await tenantId(P4_TENANT)
    const einkauf = await userClient(P4_EINKAUF)
    const ins = (extra: Record<string, unknown>) =>
      einkauf.from("addresses").insert({ tenant_id: tenant, address_base: randomBase(), address_suffix: "0001", name: "E2E Direkt", ...extra }).select("id")
    for (const [label, extra] of [
      ["roles", { roles: ["boss"] }],
      ["gln", { gln: "123" }],
      ["suffix", { address_suffix: "12" }],
      ["base", { address_base: "12345678901" }],
      ["base letters", { address_base: "12ab" }],
      ["empty name", { name: "  " }],
      ["code too long", { code: "x".repeat(11) }],
      ["vat too long", { vat_id: "x".repeat(16) }],
    ] as const) {
      const res = await ins(extra)
      expect(res.error, label).not.toBeNull()
      expect(res.data ?? [], label).toHaveLength(0)
    }
    // clients cannot create inactive addresses
    const created = await ins({ is_active: false })
    expect(created.error).toBeNull()
    createdAddresses.push(created.data![0].id)
    expect((await admin.from("addresses").select("is_active").eq("id", created.data![0].id).single()).data!.is_active).toBe(true)
  })

  test("XSS payloads in address and contact fields are rendered as text, never executed", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>`
    const address = await mkAddress(tenant, { name: payload, name_addition: payload, city: payload, remark: payload, code: "<b>X</b>" })
    const contact = await mkContact(tenant, address.id, { last_name: payload, first_name: payload, function_title: payload })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await expect(page.getByRole("textbox", { name: /^Name \/ Firma/ })).toHaveValue(payload)
    await openTab(page, "Kontakt")
    await expect(page.getByRole("cell", { name: payload }).first()).toBeVisible()
    await page.goto(`/adressen?mandant=${tenant}&q=${encodeURIComponent("img src=x")}`)
    await expect(page.getByRole("cell", { name: payload }).first()).toBeVisible()
    await page.goto(`/kontakte?mandant=${tenant}&q=${encodeURIComponent("img src=x")}`)
    await expect(page.getByRole("button", { name: payload }).first()).toBeVisible()
    await page.goto(`/adressen?mandant=${tenant}&q=${encodeURIComponent(payload)}`)
    // the code shows in the hint / selects as text too
    await page.goto(`/adressen/neu?mandant=${tenant}`)
    await page.getByRole("textbox", { name: /^Kürzel/ }).fill("<b>X</b>")
    await expect(page.getByRole("status").filter({ hasText: "Kürzel wird bereits verwendet" })).toBeVisible()
    await openTab(page, "Verknüpfungen")
    await combo(page, "Übergeordnete Adresse").click()
    await page.getByPlaceholder("Nummer, Name oder Kürzel suchen …").fill("img src=x")
    await expect(page.getByRole("option").first()).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    void contact
  })

  test("search input cannot break the queries (SQL/PostgREST filter injection attempts)", async ({ page }) => {
    test.setTimeout(120_000) // ~16 page loads on a dev server
    const tenant = await tenantId(P4_TENANT)
    await login(page, P4_EINKAUF)
    for (const q of ["'; drop table addresses; --", "%", "_", "a,name.ilike.%", "x),(is_active.eq.true", '"quoted"', "\\", "a".repeat(500)]) {
      for (const path of ["/adressen", "/kontakte"]) {
        const res = await page.goto(`${path}?mandant=${tenant}&q=${encodeURIComponent(q)}&rolle=${encodeURIComponent(q)}&land=${encodeURIComponent(q)}&status=${encodeURIComponent(q)}&seite=${encodeURIComponent(q)}`)
        expect(res!.status(), `${path} ${q}`).toBeLessThan(500)
      }
      const opt = await page.request.get(`/api/tenants/${tenant}/addresses/options?q=${encodeURIComponent(q)}`)
      expect(opt.status(), q).toBeLessThan(500)
    }
    expect((await admin.from("addresses").select("id", { head: true, count: "exact" })).error).toBeNull()
    // an injected "or" must not leak rows: a nonsense search returns nothing
    await page.goto(`/adressen?mandant=${tenant}&q=${encodeURIComponent("x),(is_active.eq.true")}`)
    await expect(page.getByText("Keine Adressen gefunden")).toBeVisible()
    await page.goto(`/kontakte?mandant=${tenant}&q=${encodeURIComponent("x),(is_active.eq.true")}`)
    await expect(page.getByText("Keine Kontakte gefunden")).toBeVisible()
    // options endpoint: wildcard characters are literal
    const a = await mkAddress(tenant, { name: "E2E 100% Echt_Name" })
    const literal = await (await page.request.get(`/api/tenants/${tenant}/addresses/options?q=${encodeURIComponent("100% Echt_Name")}`)).json()
    expect(literal.items.map((i: { id: string }) => i.id)).toContain(a.id)
    const wildcard = await (await page.request.get(`/api/tenants/${tenant}/addresses/options?q=${encodeURIComponent("E2E 1_0% Echt")}`)).json()
    expect(wildcard.items.map((i: { id: string }) => i.id)).not.toContain(a.id)
  })

  test("API input validation: wrong types, oversized and mass-assignment payloads are rejected or ignored", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const foreign = await tenantId(P4_TENANT_FREMD)
    await login(page, P4_EINKAUF)
    const post = (data: unknown) => page.request.post(`/api/tenants/${tenant}/addresses`, { data })
    const ok = () => ({ addressBase: randomBase(), suffix: "0001", name: "E2E Mass" })

    expect((await post({ ...ok(), addressBase: 4711 })).status()).toBe(400)
    expect((await post({ ...ok(), roles: "customer" })).status()).toBe(400)
    expect((await post({ ...ok(), name: "x".repeat(201) })).status()).toBe(400)
    expect((await post({ ...ok(), remark: "x".repeat(2001) })).status()).toBe(400)
    expect((await post({ ...ok(), countryId: "nope" })).status()).toBe(400)
    expect((await post("not json")).status()).toBe(400)
    const broken = await page.request.post(`/api/tenants/${tenant}/addresses`, { headers: { "Content-Type": "application/json" }, data: "{broken" })
    expect(broken.status()).toBe(400)
    expect((await page.request.post(`/api/tenants/not-a-uuid/addresses`, { data: ok() })).status()).toBe(404)
    expect((await page.request.get(`/api/tenants/${tenant}/addresses/options?excludeSubtreeOf=nope`)).status()).toBe(400)
    expect((await page.request.get(`/api/tenants/${tenant}/addresses/options?q=${"a".repeat(101)}`)).status()).toBe(400)
    expect((await page.request.get(`/api/tenants/${tenant}/addresses/code-check`)).status()).toBe(400)
    expect((await page.request.patch(`/api/tenants/${tenant}/addresses/11111111-1111-4111-8111-111111111111/status`, { data: { isActive: "ja" } })).status()).toBe(400)
    expect((await page.request.post(`/api/tenants/${tenant}/contacts`, { data: { addressId: "x", lastName: "x" } })).status()).toBe(400)

    // mass assignment: tenant_id / is_active / computed fields in the body are ignored
    const body = { ...ok(), tenant_id: foreign, tenantId: foreign, is_active: false, isActive: false, addressNumber: "HACK.0000", address_number: "HACK.0000", search_text: "hack", created_by: null }
    const res = await post(body)
    expect(res.status(), await res.text()).toBe(201)
    const created = await res.json()
    createdAddresses.push(created.id)
    const { data } = await admin.from("addresses").select("tenant_id, address_number, is_active, search_text").eq("id", created.id).single()
    expect(data).toMatchObject({ tenant_id: tenant, address_number: `${body.addressBase}.0001`, is_active: true })
    expect(data!.search_text).not.toContain("hack")

    // PATCH cannot flip the status either
    await lockAddress(page, tenant, created.id)
    const patch = await page.request.patch(`/api/tenants/${tenant}/addresses/${created.id}`, {
      data: { ...(await bodyOf(created.id)), isActive: false, is_active: false },
    })
    expect(patch.status()).toBe(200)
    expect((await admin.from("addresses").select("is_active").eq("id", created.id).single()).data!.is_active).toBe(true)

    // contacts: the address of an existing contact cannot be changed through the body
    const other = await mkAddress(tenant)
    const contact = await mkContact(tenant, created.id)
    await lockAddress(page, tenant, contact.id, "contact")
    const cpatch = await page.request.patch(`/api/tenants/${tenant}/contacts/${contact.id}`, { data: { lastName: "Neu", addressId: other.id, address_id: other.id, tenant_id: foreign } })
    expect(cpatch.status()).toBe(200)
    expect((await admin.from("contacts").select("address_id, tenant_id, last_name").eq("id", contact.id).single()).data).toEqual({ address_id: created.id, tenant_id: tenant, last_name: "Neu" })
  })

  test("responses leak no internals (database errors are generic) and set no secrets in the page", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    await login(page, P4_EINKAUF)
    const attempts = [
      page.request.post(`/api/tenants/${tenant}/addresses`, { data: { addressBase: randomBase(), suffix: "0001", name: "x", countryId: "11111111-1111-4111-8111-111111111111" } }),
      page.request.post(`/api/tenants/${tenant}/contacts`, { data: { addressId: "11111111-1111-4111-8111-111111111111", lastName: "x" } }),
      page.request.patch(`/api/tenants/${tenant}/addresses/11111111-1111-4111-8111-111111111111`, { data: { addressBase: "1", suffix: "0001", name: "x" } }),
    ]
    for (const res of await Promise.all(attempts)) {
      const text = await res.text()
      expect(res.status()).toBeGreaterThanOrEqual(400)
      expect(text).not.toMatch(/violates|constraint|pg_|postgres|stack|supabase|SELECT |INSERT |public\./i)
    }
    await page.goto(`/adressen?mandant=${tenant}`)
    const html = await page.content()
    expect(html).not.toMatch(/service_role|SUPABASE_SERVICE|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI/)
  })

  test("lock endpoint cannot be abused across tenants or on unknown record ids", async ({ page }) => {
    const foreign = await tenantId(P4_TENANT_FREMD)
    const tenant = await tenantId(P4_TENANT)
    const theirs = await mkAddress(foreign)
    await login(page, P4_EINKAUF)
    expect((await page.request.post(`/api/tenants/${foreign}/locks`, { data: { resourceType: "address", resourceId: theirs.id } })).status()).toBe(403)
    // an address of another tenant cannot be locked through the own tenant
    const res = await page.request.post(`/api/tenants/${tenant}/locks`, { data: { resourceType: "address", resourceId: theirs.id } })
    expect([200, 403, 404]).toContain(res.status())
    expect((await admin.from("edit_locks").select("tenant_id").eq("resource_id", theirs.id)).data?.every((l) => l.tenant_id === tenant)).toBe(true)
    await admin.from("edit_locks").delete().eq("resource_id", theirs.id)
  })

  test("rapid repeated requests do not break the app (no 5xx)", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    await login(page, P4_EINKAUF)
    const results = await Promise.all(
      Array.from({ length: 40 }, () => page.request.get(`/api/tenants/${tenant}/addresses/options?q=E2E`))
    )
    expect(results.every((r) => r.status() < 500)).toBe(true)
  })
})

// =============================================================================================
test.describe("PROJ-4: Responsive", () => {
  for (const [name, width, height] of [["375px", 375, 812], ["768px", 768, 1024], ["1440px", 1440, 900]] as const) {
    test(`${width === 768 ? "BUG-4: " : ""}the address list and form are usable at ${name} without horizontal page scroll`, async ({ page }) => {
      const tenant = await tenantId(P4_TENANT)
      const address = await mkAddress(tenant, { name: "E2E Responsive", roles: ["customer", "supplier"], city: "Hamburg" })
      await page.setViewportSize({ width, height })
      await login(page, P4_EINKAUF)
      for (const path of [`/adressen?mandant=${tenant}&q=${address.base}`, addressUrl(tenant, address.id), `/adressen/neu?mandant=${tenant}`, `/kontakte?mandant=${tenant}`]) {
        await page.goto(path)
        await page.waitForLoadState("networkidle")
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${path} @${name}`).toBeLessThanOrEqual(1)
      }
      await page.goto(addressUrl(tenant, address.id))
      await expect(page.getByRole("tab", { name: "Stammdaten" })).toBeVisible()
      await expect(page.getByRole("tab", { name: "Steuer & Bemerkung" })).toBeVisible()
    })
  }
})

// =============================================================================================
test.describe("PROJ-4: Weitere Randfälle", () => {
  test("Edge: a network failure while saving keeps the input and shows an error", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Netzwerk" })
    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)
    await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill("E2E Netzwerk geändert")

    await page.route(`**/api/tenants/${tenant}/addresses/${address.id}`, (route) => route.abort("connectionfailed"))
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByText("Verbindung zum Server fehlgeschlagen")).toBeVisible()
    await expect(page.getByRole("textbox", { name: /^Name \/ Firma/ })).toHaveValue("E2E Netzwerk geändert")
    await expect(page.getByRole("button", { name: "Speichern" })).toBeEnabled()
    expect((await admin.from("addresses").select("name").eq("id", address.id).single()).data!.name).toBe("E2E Netzwerk")

    // after the outage the same input can be saved
    await page.unroute(`**/api/tenants/${tenant}/addresses/${address.id}`)
    await page.getByRole("button", { name: "Speichern" }).click()
    await expect(page.getByRole("button", { name: "Bearbeiten" })).toBeVisible()
    expect((await admin.from("addresses").select("name").eq("id", address.id).single()).data!.name).toBe("E2E Netzwerk geändert")
  })

  test("Edge: after changing the parent address the Kontakt tab shows the contacts of the new parent", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const parentA = await mkAddress(tenant, { name: "E2E Eltern A" })
    const parentB = await mkAddress(tenant, { name: "E2E Eltern B" })
    const child = await mkAddress(tenant, { parent_address_id: parentA.id })
    const cA = await mkContact(tenant, parentA.id, { last_name: `ElternA${Math.random().toString(36).slice(2, 6)}` })
    const cB = await mkContact(tenant, parentB.id, { last_name: `ElternB${Math.random().toString(36).slice(2, 6)}` })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, child.id))
    await openTab(page, "Kontakt")
    await expect(page.getByText(cA.lastName)).toBeVisible()
    await expect(page.getByText(cB.lastName)).toHaveCount(0)

    await lockAddress(page, tenant, child.id)
    const res = await page.request.patch(`/api/tenants/${tenant}/addresses/${child.id}`, { data: await bodyOf(child.id, { parentAddressId: parentB.id }) })
    expect(res.status()).toBe(200)
    await page.goto(addressUrl(tenant, child.id))
    await openTab(page, "Kontakt")
    await expect(page.getByText(cB.lastName)).toBeVisible()
    await expect(page.getByText(cA.lastName)).toHaveCount(0)

    // removing the parent removes all inherited contacts
    await lockAddress(page, tenant, child.id)
    expect((await page.request.patch(`/api/tenants/${tenant}/addresses/${child.id}`, { data: await bodyOf(child.id, { parentAddressId: null }) })).status()).toBe(200)
    await page.goto(addressUrl(tenant, child.id))
    await openTab(page, "Kontakt")
    await expect(page.getByText("Noch keine Kontakte")).toBeVisible()
  })

  test("Edge: a user who may deactivate addresses but has no contact rights still deactivates the contacts along", async ({ page }, testInfo) => {
    const t = await mkTenantWithUser(testInfo, [["adressen", "write", true]])
    const address = await mkAddress(t.tenant)
    const contact = await mkContact(t.tenant, address.id)

    await login(page, t.username)
    await page.goto(addressUrl(t.tenant, address.id))
    await expect(page.getByRole("tab", { name: "Kontakt" })).toHaveCount(0)
    await page.getByRole("button", { name: "Deaktivieren", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Deaktivieren", exact: true }).click()
    await expect(page.getByRole("button", { name: "Aktivieren", exact: true })).toBeVisible()
    expect((await admin.from("contacts").select("is_active").eq("id", contact.id).single()).data!.is_active).toBe(false)
    // …but this user cannot touch contacts directly
    const res = await page.request.patch(`/api/tenants/${t.tenant}/contacts/${contact.id}/status`, { data: { isActive: true } })
    expect(res.status()).toBe(403)
  })

  test("AC-36: reactivating with 'Nein' reactivates only the chosen address", async ({ page }) => {
    const tenant = await tenantId(P4_TENANT)
    const root = await mkAddress(tenant)
    const kid = await mkAddress(tenant, { parent_address_id: root.id })
    // the database refuses NEW references to inactive addresses, so deactivate afterwards
    await admin.from("addresses").update({ is_active: false }).in("id", [root.id, kid.id])
    await login(page, P4_ADMIN)
    await page.goto(addressUrl(tenant, root.id))
    await page.getByRole("button", { name: "Aktivieren", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Nein, nur diese Adresse" }).click()
    await expect(page.getByRole("button", { name: "Deaktivieren", exact: true })).toBeVisible()
    const rows = (await admin.from("addresses").select("id, is_active").in("id", [root.id, kid.id])).data!
    expect(rows.find((r) => r.id === root.id)!.is_active).toBe(true)
    expect(rows.find((r) => r.id === kid.id)!.is_active).toBe(false)
  })

  test("Performance: with 3000 addresses the list, the search and the selection stay fast", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const t = await mkTenantWithUser(testInfo, [["adressen", "write", true], ["kontakte", "read"]])
    const marker = `Perf${uid(testInfo).replace(/[^a-z0-9]/g, "").slice(-5)}`
    const rows = Array.from({ length: 3000 }, (_, i) => ({
      tenant_id: t.tenant,
      address_base: String(1000 + (i % 1000)),
      address_suffix: String(Math.floor(i / 1000) + 1).padStart(4, "0"),
      name: `${marker} Firma ${i}`,
      city: i % 7 === 0 ? "Hamburg" : "Berlin",
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("addresses").insert(rows.slice(i, i + 500))
      expect(error).toBeNull()
    }

    await login(page, t.username)
    const timed = async (path: string) => {
      const started = Date.now()
      const res = await page.goto(path)
      expect(res!.status()).toBeLessThan(500)
      return Date.now() - started
    }
    // Page times include the Next DEV server (unoptimised, compiles on demand); the database itself
    // answers list and search in a few milliseconds (EXPLAIN ANALYZE, see QA notes). Sanity bound only.
    await timed(`/adressen?mandant=${t.tenant}`) // warm-up (dev compile)
    expect(await timed(`/adressen?mandant=${t.tenant}`)).toBeLessThan(10_000)
    await expect(page.getByText(/Seite 1 von 120/).first()).toBeVisible()
    expect(await timed(`/adressen?mandant=${t.tenant}&q=${marker}+Firma+2999`)).toBeLessThan(10_000)
    await expect(page.getByRole("row")).toHaveCount(2) // header + the one hit
    expect(await timed(`/adressen?mandant=${t.tenant}&q=${marker}&seite=100`)).toBeLessThan(10_000)
    await expect(page.getByText(/Seite 100 von 120/).first()).toBeVisible()

    const started = Date.now()
    const options = await page.request.get(`/api/tenants/${t.tenant}/addresses/options?q=${marker}+Firma+15`)
    expect(options.status()).toBe(200)
    expect((await options.json()).items.length).toBeLessThanOrEqual(25)
    expect(Date.now() - started).toBeLessThan(2000)

    // hierarchy over a big flat tree: one parent with 500 children, cascade deactivation in one step
    const { data: root } = await admin.from("addresses").select("id").eq("tenant_id", t.tenant).eq("address_base", "1000").eq("address_suffix", "0001").single()
    await admin.from("addresses").update({ parent_address_id: root!.id }).eq("tenant_id", t.tenant).neq("id", root!.id).like("name", `${marker} Firma 1%`).lt("address_base", "1500")
    const cascadeStarted = Date.now()
    const res = await page.request.patch(`/api/tenants/${t.tenant}/addresses/${root!.id}/status`, { data: { isActive: false, includeChildren: true } })
    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).changedAddresses).toBeGreaterThan(100)
    expect(Date.now() - cascadeStarted).toBeLessThan(5000)
  })
})

// =============================================================================================
// Bugs found by /qa that are still open (none at the moment). Each test asserts the CORRECT behaviour and is marked
// test.fail(): it passes as long as the bug exists. Remove test.fail() once the bug is fixed.
test.describe("PROJ-4 QA: known bugs (open)", () => {
  test("BUG-1: saving a contact in the dialog must not also submit the address form", async ({ page }) => {
    
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Bubbling" })
    const before = (await admin.from("addresses").select("updated_at").eq("id", address.id).single()).data!.updated_at
    const addressPatches: string[] = []
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().endsWith(`/addresses/${address.id}`)) addressPatches.push(r.url())
    })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Kontakt")
    await page.getByRole("button", { name: "Kontakt anlegen" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Nachname").fill("Bubbling")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(dialog).toBeHidden()
    const { data } = await admin.from("contacts").select("id").eq("address_id", address.id)
    createdContacts.push(...data!.map((c) => c.id))

    expect(addressPatches).toHaveLength(0)
    expect((await admin.from("addresses").select("updated_at").eq("id", address.id).single()).data!.updated_at).toBe(before)
    await expect(page.getByRole("tab", { name: "Kontakt" })).toHaveAttribute("aria-selected", "true")
    await expect(page.getByText("Adresse gespeichert")).toHaveCount(0)
  })

  test("BUG-1b: saving a contact while the address has unsaved edits must not save the address", async ({ page }) => {
    
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant, { name: "E2E Unsaved Original" })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await startEditing(page)
    await page.getByRole("textbox", { name: /^Name \/ Firma/ }).fill("E2E Unsaved GEAENDERT")
    await openTab(page, "Kontakt")
    await page.getByRole("button", { name: "Kontakt anlegen" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Nachname").fill("Nebeneffekt")
    await dialog.getByRole("button", { name: "Anlegen" }).click()
    await expect(dialog).toBeHidden()
    await page.waitForTimeout(1500)
    const { data } = await admin.from("contacts").select("id").eq("address_id", address.id)
    createdContacts.push(...data!.map((c) => c.id))

    // the address was never saved by the user
    expect((await admin.from("addresses").select("name").eq("id", address.id).single()).data!.name).toBe("E2E Unsaved Original")
  })

  test("BUG-5: closing the contact dialog with Escape asks before discarding unsaved input", async ({ page }) => {
    
    const tenant = await tenantId(P4_TENANT)
    const address = await mkAddress(tenant)
    const contact = await mkContact(tenant, address.id, { last_name: "EscapeKontakt" })

    await login(page, P4_EINKAUF)
    await page.goto(addressUrl(tenant, address.id))
    await openTab(page, "Kontakt")
    await page.getByRole("button", { name: /EscapeKontakt bearbeiten/ }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Nachname").fill("EscapeKontaktGeaendert")
    await page.keyboard.press("Escape")
    // expected: the "Änderungen verwerfen?" prompt (as with the Abbrechen button); actual: the input is silently lost
    await expect(page.getByRole("alertdialog").getByText("Änderungen verwerfen?")).toBeVisible({ timeout: 3000 })
    void contact
  })
})
