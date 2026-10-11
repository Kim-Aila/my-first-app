import { test, expect, type APIResponse, type Page, type TestInfo } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

import {
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  P5_EMAIL_DOMAIN,
  P5_PASSWORD,
  P5_TENANT_PREFIX,
} from "./fixtures"

// PROJ-5 (Lagerbestand). An import is a full snapshot of a whole tenant, so tests cannot share a tenant
// (chromium and Mobile Safari run in parallel): every test creates its own tenants, roles and users with
// mkWorld() and removes them in afterEach; tests/global-teardown.ts sweeps leftovers by prefix/domain.

const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// The Next dev server compiles routes on first use; one retry absorbs a reset connection while it compiles.
test.describe.configure({ retries: 1 })

let createdTenants: string[] = []
let createdUsers: string[] = []

test.afterEach(async () => {
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id)
  for (const id of createdTenants) await admin.from("tenants").delete().eq("id", id)
  createdTenants = []
  createdUsers = []
})

function uid(testInfo: TestInfo) {
  const project = testInfo.project.name.replace(/\W/g, "").toLowerCase().slice(0, 4)
  return `${project}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

type Role = "writer" | "writer2" | "reader" | "none" | "foreign"

interface World {
  tenant: string // main tenant
  other: string // second tenant (isolation)
  baseCode: string
  username: Record<Role, string>
  userId: Record<Role, string>
}

/**
 * writer/writer2: Lagerbestand write · reader: Lagerbestand read · none: Artikelstamm only (no Lagerbestand)
 * foreign: Lagerbestand write in the OTHER tenant only. All of them may read the Artikelstamm in their tenant.
 */
async function mkWorld(testInfo: TestInfo): Promise<World> {
  const id = uid(testInfo)
  const mkTenant = async (suffix: string) => {
    const { data, error } = await admin
      .from("tenants")
      .insert({ name: `${P5_TENANT_PREFIX}${id}${suffix}` })
      .select("id")
      .single()
    if (error) throw error
    createdTenants.push(data.id)
    return data.id as string
  }
  const tenant = await mkTenant("")
  const other = await mkTenant(" B")

  const mkRole = async (tenantId: string, name: string, lager: "read" | "write" | null) => {
    const { data, error } = await admin.from("roles").insert({ tenant_id: tenantId, name }).select("id").single()
    if (error) throw error
    const perms = [{ role_id: data.id, module: "warenwirtschaft", maske: "artikelstamm", access_level: "read" }]
    if (lager) perms.push({ role_id: data.id, module: "warenwirtschaft", maske: "lagerbestand", access_level: lager })
    const { error: permError } = await admin.from("role_permissions").insert(perms)
    if (permError) throw permError
    return data.id as string
  }
  const rWrite = await mkRole(tenant, "Lager", "write")
  const rRead = await mkRole(tenant, "Einkauf", "read")
  const rNone = await mkRole(tenant, "Ohne Lager", null)
  const rForeign = await mkRole(other, "Lager", "write")

  const spec: [Role, string, string][] = [
    ["writer", tenant, rWrite],
    ["writer2", tenant, rWrite],
    ["reader", tenant, rRead],
    ["none", tenant, rNone],
    ["foreign", other, rForeign],
  ]
  const username = {} as Record<Role, string>
  const userId = {} as Record<Role, string>
  for (const [role, tenantId, roleId] of spec) {
    const name = `e2e_p5_${role}_${id}`
    const email = `${name}@${P5_EMAIL_DOMAIN}`
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: P5_PASSWORD,
      email_confirm: true,
    })
    if (error) throw error
    createdUsers.push(created.user.id)
    await admin.from("user_profiles").insert({ id: created.user.id, username: name, email, is_super_admin: false })
    await admin.from("user_tenant_access").insert({ user_id: created.user.id, tenant_id: tenantId })
    await admin.from("user_roles").insert({ user_id: created.user.id, tenant_id: tenantId, role_id: roleId })
    username[role] = name
    userId[role] = created.user.id
  }

  // Master data for articles of the main tenant (base article 4xxx, type FW).
  const baseCode = String(2000 + Math.floor(Math.random() * 7000))
  await admin.from("article_types").insert({ tenant_id: tenant, code: "FW", name: "Fertigware", commodity_digit: 4 })
  await admin.from("base_articles").insert({ tenant_id: tenant, code: baseCode, name: "Pralinen", customs_tariff_number: "18069019" })

  return { tenant, other, baseCode, username, userId }
}

async function mkArticle(w: World, kennziffer: string, name: string | null = "E2E Praline") {
  const { data: base } = await admin.from("base_articles").select("id").eq("tenant_id", w.tenant).eq("code", w.baseCode).single()
  const { data, error } = await admin
    .from("articles")
    .insert({ tenant_id: w.tenant, base_article_number: w.baseCode, base_article_id: base!.id, kennziffer, name })
    .select("id, article_number")
    .single()
  if (error) throw error
  return { id: data.id as string, number: data.article_number as string }
}

async function login(page: Page, username: string) {
  for (let attempt = 1; ; attempt++) {
    await page.goto("/login")
    await page.getByLabel("Benutzername").fill(username)
    await page.getByLabel("Passwort").fill(P5_PASSWORD)
    await page.getByRole("button", { name: "Anmelden" }).click()
    try {
      await expect(page).toHaveURL("/", { timeout: 8000 })
      return
    } catch (error) {
      if (attempt >= 3) throw error
    }
  }
}

/** Selects the file and waits until React has registered it (a change before hydration is lost). */
async function chooseFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await expect(async () => {
    await page.getByLabel("CSV-Datei").setInputFiles(file)
    await expect(page.getByRole("button", { name: "Vorschau erstellen" })).toBeEnabled({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
}

async function userClient(username: string) {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: `${username}@${P5_EMAIL_DOMAIN}`, password: P5_PASSWORD })
  if (error) throw error
  return client
}

// ---------------------------------------------------------------------------------------------
// CSV of the warehouse system (semicolon CSV, payload as XML in column "Daten")
// ---------------------------------------------------------------------------------------------
const CSV_HEADER =
  "Erstellungszeitpunkt;beendet;Record-Type;Job-Number;Sub-Job-Number;Artikelnummer;Sequenz-Nummer;Referenznummer;Status;Daten;erzeugter Dateiname;Host;Synchrone Verarbeitung;Dateiname;Fehlertexte (mehrsprachig)"

interface Row {
  sscc: string
  art: string
  qty?: string | number
  free?: string | number
  qs?: string | number
  blocked?: string | number
  total?: string | number
  unit?: string
  lz?: string
  group?: string
  status?: string
  rawSscc?: string
}

const cell = (xml: string) => `"${xml.replace(/"/g, '""')}"`
const csvLine = (type: string, art: string, status: string, xml: string) =>
  `09.10.2026 11:23:32;09.10.2026 11:23:40;${type};;0;${art};1;ref;${status};${cell(xml)};;1;false;;`

function dataLine(r: Row) {
  const xml = [
    "<BestandDaten>",
    `<bestandslagergruppe>${r.group ?? "Fertigware"}</bestandslagergruppe>`,
    `<freieMenge>${r.free ?? r.qty ?? 10}</freieMenge>`,
    `<logistikzentrum>${r.lz ?? "LZ1"}</logistikzentrum>`,
    `<menge>${r.qty ?? 10}</menge>`,
    `<p_artikel-p_artikelnr>${r.art}</p_artikel-p_artikelnr>`,
    `<p_einheitMenge-p_name>${r.unit ?? "Karton"}</p_einheitMenge-p_name>`,
    `<qsMenge>${r.qs ?? 0}</qsMenge>`,
    `<qsUndSperrMenge>${r.total ?? 0}</qsUndSperrMenge>`,
    `<sperrMenge>${r.blocked ?? 0}</sperrMenge>`,
    `<sscc>${r.rawSscc ?? r.sscc}</sscc>`,
    "</BestandDaten>",
  ].join("\n")
  return csvLine("BestandDaten", r.art, r.status ?? "done", xml)
}

function csv(rows: Row[], opts: { declared?: number | string; omitEnd?: boolean; extra?: string[] } = {}) {
  const lines = [CSV_HEADER]
  if (!opts.omitEnd) {
    lines.push(csvLine("BestandEnde", "BestandEnde", "done", `<BestandEnde>\n<anzahlDatensaetze>${opts.declared ?? rows.length}</anzahlDatensaetze>\n</BestandEnde>`))
  }
  for (const r of rows) lines.push(dataLine(r))
  lines.push(...(opts.extra ?? []))
  lines.push(csvLine("BestandStart", "BestandStart", "done", "<BestandStart>\n<User>x</User>\n</BestandStart>"))
  return Buffer.from(lines.join("\r\n") + "\r\n", "utf-8")
}

/** 18-digit SSCC unique per test world. */
let sequence = 0
function sscc() {
  sequence += 1
  return `34${String(Date.now()).slice(-8)}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}${String(sequence).padStart(5, "0")}`
}

// ---------------------------------------------------------------------------------------------
// API helpers (browser session cookies via page.request)
// ---------------------------------------------------------------------------------------------
const upload = (
  page: Page, tenant: string, kind: "preview" | "commit", file: Buffer, name = "Bestand.csv", confirmEmpty = false
) =>
  page.request.post(`/api/tenants/${tenant}/stock/imports${kind === "preview" ? "/preview" : ""}`, {
    multipart: { file: { name, mimeType: "text/csv", buffer: file }, ...(confirmEmpty ? { confirmEmpty: "true" } : {}) },
  })

interface Outcome {
  fileName: string
  recordCount: number
  counts: { new: number; changed: number; unchanged: number; missing: number; reappeared: number }
  skippedCount: number
  skipped: { reason: string; count: number; lines: number[] }[]
  errors: { sscc: string; articleNumber: string | null; message: string }[]
  unknownArticles: string[]
}

async function ok(res: APIResponse, status = 200) {
  const body = await res.text()
  expect(res.status(), body).toBe(status)
  return JSON.parse(body) as Outcome
}

async function positions(tenant: string) {
  const all: Record<string, any>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("stock_positions").select("*").eq("tenant_id", tenant).order("id").range(from, from + 999)
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) return all
  }
}

async function position(tenant: string, s: string, art: string) {
  const { data, error } = await admin.from("stock_positions").select("*").eq("tenant_id", tenant).eq("sscc", s).eq("article_number", art).maybeSingle()
  if (error) throw error
  return data as Record<string, any> | null
}

const check = (page: Page, tenant: string, id: string, data: Record<string, unknown>) =>
  page.request.post(`/api/tenants/${tenant}/stock/positions/${id}/check`, { data })
const ship = (page: Page, tenant: string, id: string, data: Record<string, unknown>) =>
  page.request.post(`/api/tenants/${tenant}/stock/positions/${id}/ship`, { data })

/** Imports `rows` as a committed snapshot through the API (as the writer in `page`). */
async function commit(page: Page, tenant: string, rows: Row[]) {
  // an empty snapshot wipes the stock and needs the explicit confirmation (BUG-2)
  return ok(await upload(page, tenant, "commit", csv(rows), "Bestand.csv", rows.length === 0), 201)
}

// ===============================================================================================
// Import
// ===============================================================================================
test.describe("Import", () => {
  test("AC: preview shows counts and saves nothing; commit saves positions and a protocol", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const file = csv([
      { sscc: sscc(), art: "41100.451", qty: "48.0" },
      { sscc: sscc(), art: "41100.0451", qty: 5 },
    ])

    const preview = await ok(await upload(page, w.tenant, "preview", file))
    expect(preview.counts).toEqual({ new: 2, changed: 0, unchanged: 0, missing: 0, reappeared: 0 })
    expect(preview.recordCount).toBe(2)
    expect((await positions(w.tenant)).length).toBe(0)
    expect((await admin.from("stock_imports").select("id").eq("tenant_id", w.tenant)).data).toHaveLength(0)

    const done = await ok(await upload(page, w.tenant, "commit", file, "Abzug 2026-10-09.csv"), 201)
    expect(done.counts.new).toBe(2)
    expect(await positions(w.tenant)).toHaveLength(2)
    const log = (await admin.from("stock_imports").select("*").eq("tenant_id", w.tenant)).data!
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ file_name: "Abzug 2026-10-09.csv", new_count: 2, user_name: w.username.writer })
  })

  test("AC: through the UI, cancelling the preview changes nothing; confirming imports", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=import`)
    const file = { name: "Bestand.csv", mimeType: "text/csv", buffer: csv([{ sscc: sscc(), art: "41100.451" }, { sscc: sscc(), art: "41100.452" }]) }

    await chooseFile(page, file)
    await page.getByRole("button", { name: "Vorschau erstellen" }).click()
    await expect(page.getByText("Noch ist nichts gespeichert.")).toBeVisible()
    await expect(page.getByText("Noch ist nichts gespeichert.")).toContainText("2 Datensätze")
    await page.getByRole("button", { name: "Abbrechen" }).click()
    expect(await positions(w.tenant)).toHaveLength(0)

    await chooseFile(page, file)
    await page.getByRole("button", { name: "Vorschau erstellen" }).click()
    await page.getByRole("button", { name: "Übernehmen" }).click()
    await expect(page.getByText("Import abgeschlossen")).toBeVisible()
    await expect(page.getByText("2 Artikelnummern nicht im Artikelstamm")).toBeVisible()
    expect(await positions(w.tenant)).toHaveLength(2)
    await expect(page.getByRole("heading", { name: "Import-Protokoll" })).toBeVisible()
    await expect(page.getByText("Bestand.csv").first()).toBeVisible()
  })

  test("AC: a file without BestandEnde or with a wrong record count is rejected as a whole", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    await commit(page, w.tenant, [{ sscc: sscc(), art: "41100.0451" }])

    for (const kind of ["preview", "commit"] as const) {
      const noEnd = await upload(page, w.tenant, kind, csv([{ sscc: sscc(), art: "41100.0452" }], { omitEnd: true }))
      expect(noEnd.status()).toBe(400)
      expect((await noEnd.json()).error).toContain("BestandEnde")

      const wrong = await upload(page, w.tenant, kind, csv([{ sscc: sscc(), art: "41100.0452" }], { declared: 5 }))
      expect(wrong.status()).toBe(400)
      expect((await wrong.json()).error).toMatch(/5 Datensätze erwartet, enthalten sind 1/)
    }
    const all = await positions(w.tenant)
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe("in_stock")
  })

  test("AC: unreadable files are rejected and the stock stays unchanged", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    await commit(page, w.tenant, [{ sscc: sscc(), art: "41100.0451" }])

    const bad: [string, Buffer][] = [
      ["binary", Buffer.from([0, 255, 3, 4, 200, 201, 9, 10, 0, 0])],
      ["plain text", Buffer.from("das ist keine csv datei\nnur text")],
      ["other columns", Buffer.from("a;b;c\n1;2;3\n")],
      ["broken xml", Buffer.from(`${CSV_HEADER}\n${csvLine("BestandEnde", "x", "done", "<BestandEnde><anzahlDatensaetze>1</anzahlDatensaetze></BestandEnde>")}\n${csvLine("BestandDaten", "x", "done", "<BestandDaten><sscc>1</BestandDaten>")}\n`)],
      ["open quote", Buffer.from(`${CSV_HEADER}\n09.10.2026;x;BestandEnde;;0;x;1;r;done;"<BestandEnde>`)],
    ]
    for (const [label, file] of bad) {
      for (const kind of ["preview", "commit"] as const) {
        const res = await upload(page, w.tenant, kind, file)
        expect(res.status(), `${label}/${kind}`).toBe(400)
        expect((await res.json()).error, label).toBeTruthy()
      }
    }
    const empty = await page.request.post(`/api/tenants/${w.tenant}/stock/imports`, { multipart: { file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) } } })
    expect(empty.status()).toBe(400)
    const noFile = await page.request.post(`/api/tenants/${w.tenant}/stock/imports`, { multipart: { other: "x" } })
    expect(noFile.status()).toBe(400)
    expect(await positions(w.tenant)).toHaveLength(1)
  })

  test("AC: rows whose status is not 'done' are not taken over", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const failed = sscc()
    const res = await ok(await upload(page, w.tenant, "commit", csv([{ sscc: sscc(), art: "41100.0451" }, { sscc: failed, art: "41100.0452", status: "error" }])), 201)
    expect(res.counts.new).toBe(1)
    expect(res.skippedCount).toBe(1)
    expect(res.skipped[0].reason).toContain("nicht „done“")
    expect(await position(w.tenant, failed, "41100.0452")).toBeNull()
  })

  test("AC: importing the same file again shows no changes and keeps the stock", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const file = csv([{ sscc: sscc(), art: "41100.0451", qty: 7 }, { sscc: sscc(), art: "41100.0452", qty: 9 }])
    await ok(await upload(page, w.tenant, "commit", file), 201)
    const before = (await positions(w.tenant)).map((p) => [p.sscc, p.quantity, p.status, p.updated_at]).sort()

    const preview = await ok(await upload(page, w.tenant, "preview", file))
    expect(preview.counts).toEqual({ new: 0, changed: 0, unchanged: 2, missing: 0, reappeared: 0 })
    await ok(await upload(page, w.tenant, "commit", file), 201)
    const after = (await positions(w.tenant)).map((p) => [p.sscc, p.quantity, p.status, p.updated_at]).sort()
    expect(after).toEqual(before)
  })

  test("AC: changed quantities are counted and updated", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const s = sscc()
    await commit(page, w.tenant, [{ sscc: s, art: "41100.0451", qty: 10 }])
    const res = await commit(page, w.tenant, [{ sscc: s, art: "41100.0451", qty: 6, free: 4, qs: 2, blocked: 0, total: 2 }])
    expect(res.counts).toEqual({ new: 0, changed: 1, unchanged: 0, missing: 0, reappeared: 0 })
    expect(await position(w.tenant, s, "41100.0451")).toMatchObject({ quantity: 6, free_quantity: 4, qs_quantity: 2, qs_and_blocked_quantity: 2 })
  })

  test("AC: a second import running for the tenant is rejected with a hint (parallel commits never corrupt data)", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const rows = Array.from({ length: 1500 }, (_, i) => ({ sscc: sscc() + String(i), art: `${41000 + (i % 50)}.0451` }))
    const file = csv(rows)
    const responses = await Promise.all(Array.from({ length: 4 }, () => upload(page, w.tenant, "commit", file)))
    const statuses = responses.map((r) => r.status())
    // every response is either a success or the "import already running" conflict — never a server error
    for (const status of statuses) expect([201, 409]).toContain(status)
    for (const res of responses.filter((r) => r.status() === 409)) {
      expect((await res.json()).error).toContain("läuft bereits ein Import")
    }
    const succeeded = statuses.filter((s) => s === 201).length
    expect(succeeded).toBeGreaterThanOrEqual(1)
    expect((await admin.from("stock_imports").select("id").eq("tenant_id", w.tenant)).data).toHaveLength(succeeded)
    expect(await positions(w.tenant)).toHaveLength(1500)
    testInfo.annotations.push({ type: "info", description: `parallel commit statuses: ${statuses.join(",")}` })
  })

  test("AC: a user with read-only access sees no import, check or ship actions (UI and API)", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const s = sscc()
    await login(page, w.username.writer)
    await commit(page, w.tenant, [{ sscc: s, art: "41100.0451" }])
    await commit(page, w.tenant, [{ sscc: sscc(), art: "41100.0452" }]) // 41100.0451 now missing_unchecked
    const missing = (await position(w.tenant, s, "41100.0451"))!
    expect(missing.status).toBe("missing_unchecked")

    await page.context().clearCookies()
    await login(page, w.username.reader)
    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    await expect(page.getByRole("heading", { name: "Lagerbestand", level: 1 })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Import" })).toHaveCount(0)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=import`) // falls back to the first tab
    await expect(page.getByRole("button", { name: "Vorschau erstellen" })).toHaveCount(0)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=pruefliste`)
    await expect(page.getByRole("tab", { name: /Prüfliste/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Geprüft i.O." })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Als versendet buchen" })).toHaveCount(0)

    const file = csv([{ sscc: sscc(), art: "41100.0453" }])
    expect((await upload(page, w.tenant, "preview", file)).status()).toBe(403)
    expect((await upload(page, w.tenant, "commit", file)).status()).toBe(403)
    expect((await check(page, w.tenant, missing.id, { expectedStatus: "missing_unchecked" })).status()).toBe(403)
    expect((await ship(page, w.tenant, missing.id, { expectedStatus: "missing_unchecked" })).status()).toBe(403)
    expect((await position(w.tenant, s, "41100.0451"))!.status).toBe("missing_unchecked")
    // …but reading works
    expect((await page.request.get(`/api/tenants/${w.tenant}/stock/positions/${missing.id}`)).status()).toBe(200)
  })

  test("Edge: an empty file (0 records) warns clearly before it would mark all stock as missing", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    await commit(page, w.tenant, [{ sscc: sscc(), art: "41100.0451" }, { sscc: sscc(), art: "41100.0452" }])
    const empty = csv([])
    const preview = await ok(await upload(page, w.tenant, "preview", empty))
    expect(preview.counts.missing).toBe(2)
    expect(preview.recordCount).toBe(0)

    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=import`)
    await chooseFile(page, { name: "leer.csv", mimeType: "text/csv", buffer: empty })
    await page.getByRole("button", { name: "Vorschau erstellen" }).click()
    await expect(page.getByText("Die Datei enthält keine Datensätze")).toBeVisible()
    await page.getByRole("button", { name: "Trotzdem übernehmen" }).click()
    await expect(page.getByRole("alertdialog")).toContainText("Gesamten Bestand als fehlend markieren?")
    await page.getByRole("button", { name: "Abbrechen" }).last().click()
    expect((await positions(w.tenant)).every((p) => p.status === "in_stock")).toBe(true)
    // confirming in the dialog sends the confirmation to the server
    await page.getByRole("button", { name: "Trotzdem übernehmen" }).click()
    await page.getByRole("button", { name: "Ja, übernehmen" }).click()
    await expect(page.getByText("Import abgeschlossen")).toBeVisible()
    expect((await positions(w.tenant)).every((p) => p.status === "missing_unchecked")).toBe(true)
  })

  test("BUG-2: the server refuses a 0-record file that would wipe the stock unless confirmed", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    // nothing to wipe → no confirmation needed
    await ok(await upload(page, w.tenant, "commit", csv([])), 201)
    await commit(page, w.tenant, [{ sscc: sscc(), art: "41100.0451" }, { sscc: sscc(), art: "41100.0452" }])

    const refused = await upload(page, w.tenant, "commit", csv([]))
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error).toContain("ausdrücklich bestätigt")
    expect((await positions(w.tenant)).every((p) => p.status === "in_stock")).toBe(true)
    expect((await upload(page, w.tenant, "commit", csv([]), "Bestand.csv", false)).status()).toBe(409)

    const confirmed = await ok(await upload(page, w.tenant, "commit", csv([]), "leer.csv", true), 201)
    expect(confirmed.counts.missing).toBe(2)
    expect((await positions(w.tenant)).every((p) => p.status === "missing_unchecked")).toBe(true)
  })

  test("Edge: umlauts in a Mac Roman / Windows-1252 file are read correctly", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const s = sscc()
    const text = csv([{ sscc: s, art: "41100.0451", unit: "Stück", group: "Süßwaren" }]).toString("utf-8")
    for (const [encoding, bytes] of [
      ["win1252", Buffer.from(text, "latin1")], // ü = FC, ß = DF
      ["utf8", Buffer.from(text, "utf-8")],
    ] as const) {
      await ok(await upload(page, w.tenant, "commit", bytes), 201)
      expect(await position(w.tenant, s, "41100.0451"), encoding).toMatchObject({ unit: "Stück", stock_group: "Süßwaren" })
    }
  })

  test("Edge: decimals are read as numbers ('48.0', '12,5'); empty, negative or non-numeric quantities are skipped", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const [a, b, c, d, e] = [sscc(), sscc(), sscc(), sscc(), sscc()]
    const res = await commit(page, w.tenant, [
      { sscc: a, art: "41100.0451", qty: "48.0", free: "48.0" },
      { sscc: b, art: "41100.0451", qty: "12,5", free: "12,5" },
      { sscc: c, art: "41100.0451", qty: "-3" },
      { sscc: d, art: "41100.0451", qty: "" },
      { sscc: e, art: "41100.0451", qty: "viel" },
    ])
    expect(res.counts.new).toBe(2)
    expect(res.skippedCount).toBe(3)
    expect(res.skipped.find((g) => g.reason.includes("Mengenfeld"))?.count).toBe(3)
    expect(await position(w.tenant, a, "41100.0451")).toMatchObject({ quantity: 48 })
    expect(await position(w.tenant, b, "41100.0451")).toMatchObject({ quantity: 12.5 })
  })

  test("Edge: a request without session is rejected with 401", async ({ request }, testInfo) => {
    const w = await mkWorld(testInfo)
    const res = await request.post(`/api/tenants/${w.tenant}/stock/imports/preview`, {
      multipart: { file: { name: "x.csv", mimeType: "text/csv", buffer: csv([]) } },
    })
    expect(res.status()).toBe(401)
    const get = await request.get(`/api/tenants/${w.tenant}/stock/positions/${w.tenant}`)
    expect(get.status()).toBe(401)
  })
})

// ===============================================================================================
// Artikelnummer und Artikelstamm
// ===============================================================================================
test.describe("Artikelnummer und Artikelstamm", () => {
  test("AC: 41100.451 is kept as 41100.0451, 41100.0451 stays unchanged", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const [a, b] = [sscc(), sscc()]
    await commit(page, w.tenant, [{ sscc: a, art: "41100.451" }, { sscc: b, art: "41100.0451" }])
    expect(await position(w.tenant, a, "41100.0451")).not.toBeNull()
    expect(await position(w.tenant, b, "41100.0451")).not.toBeNull()
    expect((await positions(w.tenant)).map((p) => p.article_number)).toEqual(["41100.0451", "41100.0451"])
  })

  test("AC: article numbers not matching 'digits.3-4 digits' are skipped with line number and reason; the rest is processed", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const good = sscc()
    const res = await commit(page, w.tenant, [
      { sscc: sscc(), art: "V554" },
      { sscc: good, art: "41100.0451" },
      { sscc: sscc(), art: "9998" },
      { sscc: sscc(), art: "41100.45" },
      { sscc: sscc(), art: "41100.45678" },
    ])
    expect(res.counts.new).toBe(1)
    expect(res.skippedCount).toBe(4)
    const group = res.skipped.find((g) => g.reason.includes("Artikelnummer"))!
    expect(group.count).toBe(4)
    // header = line 1, BestandEnde = line 2 → first data row is line 3
    expect(group.lines).toEqual([3, 5, 6, 7])
    expect(await position(w.tenant, good, "41100.0451")).not.toBeNull()
    expect(await positions(w.tenant)).toHaveLength(1)
  })

  test("AC: unknown articles are kept, flagged 'Nicht im Stamm', listed in the result and linked automatically once created", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const number = `${w.baseCode}.0451`
    const res = await commit(page, w.tenant, [{ sscc: sscc(), art: number, qty: 12, free: 12 }, { sscc: sscc(), art: "41100.0451", qty: 3, free: 3 }])
    expect(res.unknownArticles.sort()).toEqual([number, "41100.0451"].sort())

    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    const row = page.getByRole("row", { name: new RegExp(number.replace(".", "\\.")) })
    await expect(row).toContainText("Nicht im Stamm")

    // filter "Artikel nicht im Stamm"
    await page.goto(`/lagerbestand?mandant=${w.tenant}&unbekannt=1`)
    await expect(page.getByRole("row", { name: /41100\.0451/ })).toBeVisible()

    // creating the article in the Artikelstamm links the stock without any import
    const article = await mkArticle(w, "0451")
    expect(article.number).toBe(number)
    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    await expect(page.getByRole("row", { name: new RegExp(number.replace(".", "\\.")) })).not.toContainText("Nicht im Stamm")
    await page.goto(`/lagerbestand?mandant=${w.tenant}&unbekannt=1`)
    await expect(page.getByRole("row", { name: new RegExp(number.replace(".", "\\.")) })).toHaveCount(0)
    await expect(page.getByRole("row", { name: /41100\.0451/ })).toBeVisible()
  })

  test("BUG-1: an article without a Bezeichnung is not shown as 'Nicht im Stamm'", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const article = await mkArticle(w, "0451", null) // name is optional in the Artikelstamm
    await commit(page, w.tenant, [{ sscc: sscc(), art: article.number }])
    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    await expect(page.getByRole("row", { name: new RegExp(article.number.replace(".", "\\.")) })).not.toContainText("Nicht im Stamm")
  })

  test("AC: the 'Bestand' tab of the article mask shows the five values read-only and only with read access to Lagerbestand", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const article = await mkArticle(w, "0451")
    await commit(page, w.tenant, [
      { sscc: sscc(), art: article.number, qty: 20, free: 14, qs: 4, blocked: 2, total: 6 },
      { sscc: sscc(), art: article.number, qty: 10, free: 10 },
    ])
    await page.goto(`/artikelstamm/${article.id}?mandant=${w.tenant}`)
    await page.getByRole("tab", { name: "Bestand" }).click()
    const values: Record<string, string> = { Bestand: "30", "Gesperrt QS": "4", Gesperrt: "2", "Gesperrt gesamt": "6", Verfügbar: "24" }
    for (const [label, value] of Object.entries(values)) {
      await expect(page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd")).toHaveText(value)
    }
    await expect(page.getByRole("tabpanel").getByRole("textbox")).toHaveCount(0)

    // a user without the Lagerbestand mask does not get the tab
    await page.context().clearCookies()
    await login(page, w.username.none)
    await page.goto(`/artikelstamm/${article.id}?mandant=${w.tenant}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Bestand" })).toHaveCount(0)
  })
})

// ===============================================================================================
// Doppelte SSCC / Mischpalette
// ===============================================================================================
test.describe("Doppelte SSCC / Mischpalette", () => {
  test("AC: same SSCC with different articles = mixed pallet; all rows are taken over and flagged", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const [mixed, single] = [sscc(), sscc()]
    const res = await commit(page, w.tenant, [
      { sscc: mixed, art: "41100.0451" },
      { sscc: mixed, art: "41100.0452" },
      { sscc: single, art: "41100.0451" },
    ])
    expect(res.counts.new).toBe(3)
    expect(res.errors).toHaveLength(0)

    const reader = await userClient(w.username.reader)
    const { data } = await reader.from("stock_position_list").select("sscc, is_mixed_pallet").eq("tenant_id", w.tenant)
    expect(data!.filter((r) => r.is_mixed_pallet).map((r) => r.sscc)).toEqual([mixed, mixed])
    expect(data!.find((r) => r.sscc === single)!.is_mixed_pallet).toBe(false)

    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm&mischpalette=1`)
    await expect(page.getByRole("row", { name: new RegExp(mixed) })).toHaveCount(2)
    await expect(page.getByRole("row", { name: new RegExp(single) })).toHaveCount(0)
  })

  test("AC: same SSCC with the same article more than once → all those rows are skipped with an error naming SSCC and article; rest is processed", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const [dup, fine] = [sscc(), sscc()]
    const res = await commit(page, w.tenant, [
      { sscc: dup, art: "41100.0451", qty: 1 },
      { sscc: fine, art: "41100.0451" },
      { sscc: dup, art: "41100.0451", qty: 2 },
    ])
    expect(res.counts.new).toBe(1)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toMatchObject({ sscc: dup, articleNumber: "41100.0451" })
    expect(await position(w.tenant, dup, "41100.0451")).toBeNull()
    expect(await position(w.tenant, fine, "41100.0451")).not.toBeNull()
  })

  test("AC: an existing position that appears twice in the file stays unchanged and is not marked as missing", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const dup = sscc()
    await commit(page, w.tenant, [{ sscc: dup, art: "41100.0451", qty: 10 }])
    const before = (await position(w.tenant, dup, "41100.0451"))!
    const res = await commit(page, w.tenant, [{ sscc: dup, art: "41100.0451", qty: 99 }, { sscc: dup, art: "41100.0451", qty: 98 }])
    expect(res.counts).toEqual({ new: 0, changed: 0, unchanged: 0, missing: 0, reappeared: 0 })
    expect(res.errors).toHaveLength(1)
    const after = (await position(w.tenant, dup, "41100.0451"))!
    expect(after.status).toBe("in_stock")
    expect(after.quantity).toBe(before.quantity)
  })

  test("AC: an SSCC that is not only digits is skipped and counted", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const res = await commit(page, w.tenant, [
      { sscc: "x", rawSscc: "34002996ABC", art: "41100.0451" },
      { sscc: "y", rawSscc: "", art: "41100.0451" },
      { sscc: sscc(), art: "41100.0451" },
    ])
    expect(res.counts.new).toBe(1)
    expect(res.skipped.find((g) => g.reason.includes("SSCC"))?.count).toBe(2)
  })

  test("AC: errors and skipped rows are listed separately in the result view", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const dup = sscc()
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=import`)
    const buffer = csv([{ sscc: dup, art: "41100.0451" }, { sscc: dup, art: "41100.0451" }, { sscc: sscc(), art: "V554" }])
    await chooseFile(page, { name: "x.csv", mimeType: "text/csv", buffer })
    await page.getByRole("button", { name: "Vorschau erstellen" }).click()
    await expect(page.getByRole("heading", { name: "Fehler (1)" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Übersprungene Zeilen (1)" })).toBeVisible()
    await expect(page.getByRole("cell", { name: dup })).toBeVisible()
    await expect(page.getByText("Zeile 5")).toBeVisible() // V554 is the third data row → line 5
  })
})

// ===============================================================================================
// Lebenszyklus
// ===============================================================================================
test.describe("Lebenszyklus", () => {
  async function setupMissing(page: Page, w: World) {
    const [a, b] = [sscc(), sscc()]
    await login(page, w.username.writer)
    await commit(page, w.tenant, [{ sscc: a, art: "41100.0451", qty: 10, free: 10 }, { sscc: b, art: "41100.0452", qty: 5, free: 5 }])
    const res = await commit(page, w.tenant, [{ sscc: a, art: "41100.0451", qty: 10, free: 10 }])
    expect(res.counts.missing).toBe(1)
    return { present: a, missing: b, missingPos: (await position(w.tenant, b, "41100.0452"))! }
  }

  test("AC: a position missing from the new full snapshot becomes 'Fehlt, ungeprüft', leaves the sums and appears in the review list", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { missingPos } = await setupMissing(page, w)
    expect(missingPos.status).toBe("missing_unchecked")

    const reader = await userClient(w.username.reader)
    const { data } = await reader.from("stock_by_article").select("article_number, stock, available").eq("tenant_id", w.tenant)
    expect(data!.map((r) => r.article_number)).toEqual(["41100.0451"]) // the article with only missing stock is gone
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=pruefliste`)
    await expect(page.getByRole("row", { name: new RegExp(missingPos.sscc) })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Prüfliste/ })).toContainText("1")
  })

  test("AC: a missing position that reappears is 'Im Lager' again and the missing mark is gone (also after 'geprüft i.O.')", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { present, missing, missingPos } = await setupMissing(page, w)
    expect((await check(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked", remark: "wird gesucht" })).status()).toBe(200)

    const res = await commit(page, w.tenant, [
      { sscc: present, art: "41100.0451", qty: 10, free: 10 },
      { sscc: missing, art: "41100.0452", qty: 5, free: 5 },
    ])
    expect(res.counts.reappeared).toBe(1)
    expect(await position(w.tenant, missing, "41100.0452")).toMatchObject({ status: "in_stock", checked_by: null, checked_at: null, check_remark: null })

    // and from 'ungeprüft' directly
    await commit(page, w.tenant, [{ sscc: present, art: "41100.0451", qty: 10, free: 10 }])
    expect((await position(w.tenant, missing, "41100.0452"))!.status).toBe("missing_unchecked")
    const again = await commit(page, w.tenant, [
      { sscc: present, art: "41100.0451", qty: 10, free: 10 },
      { sscc: missing, art: "41100.0452", qty: 5, free: 5 },
    ])
    expect(again.counts.reappeared).toBe(1)
    expect((await position(w.tenant, missing, "41100.0452"))!.status).toBe("in_stock")
  })

  test("AC: 'geprüft i.O.' with remark stores status, checker and time and removes the position from the review list", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { missingPos } = await setupMissing(page, w)
    const res = await check(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked", remark: "Karton beschädigt, entsorgt" })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ id: missingPos.id, status: "missing_checked" })
    const row = (await position(w.tenant, missingPos.sscc, "41100.0452"))!
    expect(row).toMatchObject({ status: "missing_checked", checked_by: w.userId.writer, check_remark: "Karton beschädigt, entsorgt" })
    expect(row.checked_at).toBeTruthy()

    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=pruefliste`)
    await expect(page.getByText("Nichts zu prüfen")).toBeVisible()
  })

  test("AC: the check remark is optional", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { missingPos } = await setupMissing(page, w)
    expect((await check(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked" })).status()).toBe(200)
    expect((await position(w.tenant, missingPos.sscc, "41100.0452"))).toMatchObject({ status: "missing_checked", check_remark: null })
  })

  test("AC: through the UI the review dialog and the shipping confirmation work", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { present, missingPos } = await setupMissing(page, w)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=pruefliste`)
    await page.getByRole("button", { name: "Geprüft i.O." }).click()
    await page.getByLabel("Bemerkung (optional)").fill("im Wareneingang gefunden")
    await page.getByRole("button", { name: "Als geprüft speichern" }).click()
    await expect(page.getByText("Nichts zu prüfen")).toBeVisible()
    expect(await position(w.tenant, missingPos.sscc, "41100.0452")).toMatchObject({ status: "missing_checked", check_remark: "im Wareneingang gefunden" })

    const { missingPos: second } = await (async () => {
      // another missing position
      const s = sscc()
      await commit(page, w.tenant, [{ sscc: present, art: "41100.0451", qty: 10, free: 10 }, { sscc: s, art: "41100.0453" }])
      await commit(page, w.tenant, [{ sscc: present, art: "41100.0451", qty: 10, free: 10 }])
      return { missingPos: (await position(w.tenant, s, "41100.0453"))! }
    })()
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=pruefliste`)
    await page.getByRole("button", { name: "Als versendet buchen" }).first().click()
    await expect(page.getByRole("alertdialog")).toContainText("Versendet")
    await page.getByRole("button", { name: "Versand buchen" }).click()
    await expect(page.getByText("Nichts zu prüfen")).toBeVisible()
    expect(await position(w.tenant, second.sscc, "41100.0453")).toMatchObject({ status: "shipped", shipped_by: w.userId.writer })
  })

  test("AC: booking a missing position as shipped stores status, time and user", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { missingPos } = await setupMissing(page, w)
    const res = await ship(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked" })
    expect(res.status()).toBe(200)
    const row = (await position(w.tenant, missingPos.sscc, "41100.0452"))!
    expect(row).toMatchObject({ status: "shipped", shipped_by: w.userId.writer })
    expect(row.shipped_at).toBeTruthy()
    // shipping twice → conflict
    expect((await ship(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked" })).status()).toBe(409)
  })

  test("AC: a shipped position stays shipped when absent; when it reappears the row is skipped, the position stays shipped and an error names the SSCC", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { present, missing, missingPos } = await setupMissing(page, w)
    await ship(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked" })

    const absent = await commit(page, w.tenant, [{ sscc: present, art: "41100.0451", qty: 10, free: 10 }])
    expect(absent.counts.missing).toBe(0)
    expect((await position(w.tenant, missing, "41100.0452"))!.status).toBe("shipped")

    const back = await commit(page, w.tenant, [
      { sscc: present, art: "41100.0451", qty: 10, free: 10 },
      { sscc: missing, art: "41100.0452", qty: 5, free: 5 },
    ])
    expect(back.counts).toEqual({ new: 0, changed: 0, unchanged: 1, missing: 0, reappeared: 0 })
    expect(back.errors).toHaveLength(1)
    expect(back.errors[0]).toMatchObject({ sscc: missing, articleNumber: "41100.0452" })
    expect(back.errors[0].message).toContain("versendet")
    expect((await position(w.tenant, missing, "41100.0452"))!.status).toBe("shipped")
  })

  test("Edge: in a mixed pallet only the missing position becomes 'Fehlt, ungeprüft'", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const mixed = sscc()
    await commit(page, w.tenant, [{ sscc: mixed, art: "41100.0451" }, { sscc: mixed, art: "41100.0452" }])
    await commit(page, w.tenant, [{ sscc: mixed, art: "41100.0451" }])
    expect((await position(w.tenant, mixed, "41100.0451"))!.status).toBe("in_stock")
    expect((await position(w.tenant, mixed, "41100.0452"))!.status).toBe("missing_unchecked")
  })

  test("Edge: two users acting on the same position at once → exactly one wins, the other gets a status conflict", async ({ page, browser }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { missingPos } = await setupMissing(page, w)
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const second = await ctx.newPage()
    try {
      await login(second, w.username.writer2)
      const [a, b] = await Promise.all([
        check(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked", remark: "A" }),
        ship(second, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked" }),
      ])
      const statuses = [a.status(), b.status()].sort()
      // A check followed by a ship is legal in the DB (ship also works from 'geprüft'), but both expected
      // 'missing_unchecked' → the second sees a different status.
      expect(statuses).toEqual([200, 409])
      const conflict = a.status() === 409 ? a : b
      expect((await conflict.json()).error).toContain("Status")
    } finally {
      await ctx.close()
    }
  })

  test("AC: the 5-year cleanup removes old non-stock positions, keeps recent and in-stock ones", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const years = (n: number) => new Date(Date.now() - n * 365.25 * 86_400_000).toISOString()
    const mk = (status: string, updated: string, art: string) => ({
      tenant_id: w.tenant, sscc: sscc(), article_number: art, quantity: 1, free_quantity: 1, qs_quantity: 0,
      blocked_quantity: 0, qs_and_blocked_quantity: 0, status, updated_at: updated,
    })
    const rows = [
      mk("shipped", years(5.5), "41100.0451"),
      mk("missing_checked", years(5.2), "41100.0452"),
      mk("missing_unchecked", years(5.1), "41100.0453"),
      mk("shipped", years(4.5), "41100.0454"),
      mk("in_stock", years(6), "41100.0455"),
    ]
    const { error } = await admin.from("stock_positions").insert(rows)
    expect(error).toBeNull()
    const cleanup = await admin.rpc("stock_cleanup")
    expect(cleanup.error).toBeNull()
    const left = (await positions(w.tenant)).map((p) => p.article_number).sort()
    expect(left).toEqual(["41100.0454", "41100.0455"])
  })

  test("AC: the position detail shows data, status, check/shipping info and the imports it appeared in", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { present, missingPos } = await setupMissing(page, w)
    await commit(page, w.tenant, [{ sscc: present, art: "41100.0451", qty: 10, free: 10 }]) // third import, missing_pos not in it
    await check(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked", remark: "Bemerkung X" })

    const res = await page.request.get(`/api/tenants/${w.tenant}/stock/positions/${missingPos.id}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ sscc: missingPos.sscc, articleNumber: "41100.0452", status: "missing_checked", checkRemark: "Bemerkung X" })
    expect(body.imports).toHaveLength(1) // only the first import contained it

    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm`)
    await page.getByRole("button", { name: new RegExp(`Details zu SSCC ${missingPos.sscc}`) }).click()
    const sheet = page.getByRole("dialog")
    await expect(sheet).toContainText("LHM-Position")
    await expect(sheet).toContainText(missingPos.sscc)
    await expect(sheet).toContainText("Bemerkung X")
    await expect(sheet).toContainText(w.username.writer)

    // unknown id / foreign id
    expect((await page.request.get(`/api/tenants/${w.tenant}/stock/positions/00000000-0000-4000-8000-000000000000`)).status()).toBe(404)
    expect((await page.request.get(`/api/tenants/${w.tenant}/stock/positions/not-a-uuid`)).status()).toBeGreaterThanOrEqual(400)
  })

  test("API: invalid inputs for check/ship are rejected", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const { missingPos } = await setupMissing(page, w)
    expect((await check(page, w.tenant, missingPos.id, { expectedStatus: "bogus" })).status()).toBe(400)
    expect((await check(page, w.tenant, missingPos.id, {})).status()).toBe(400)
    expect((await check(page, w.tenant, missingPos.id, { expectedStatus: "missing_unchecked", remark: "x".repeat(501) })).status()).toBe(400)
    expect((await ship(page, w.tenant, missingPos.id, { expectedStatus: 7 })).status()).toBe(400)
    expect((await check(page, w.tenant, missingPos.id, { expectedStatus: "in_stock" })).status()).toBe(409)
    expect((await check(page, w.tenant, "00000000-0000-4000-8000-000000000000", { expectedStatus: "missing_unchecked" })).status()).toBe(404)
    expect((await position(w.tenant, missingPos.sscc, "41100.0452"))!.status).toBe("missing_unchecked")
  })
})

// ===============================================================================================
// Anzeige
// ===============================================================================================
test.describe("Anzeige", () => {
  test("AC: stock per article sums only 'Im Lager' positions (Bestand, Gesperrt QS, Gesperrt, Gesperrt gesamt, Verfügbar)", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const gone = sscc()
    await commit(page, w.tenant, [
      { sscc: sscc(), art: "41100.0451", qty: 20, free: 14, qs: 4, blocked: 2, total: 6 },
      { sscc: sscc(), art: "41100.0451", qty: "10.5", free: "10.5" },
      { sscc: gone, art: "41100.0451", qty: 100, free: 100 },
    ])
    await commit(page, w.tenant, [
      { sscc: (await positions(w.tenant)).find((p) => p.quantity === 20)!.sscc, art: "41100.0451", qty: 20, free: 14, qs: 4, blocked: 2, total: 6 },
      { sscc: (await positions(w.tenant)).find((p) => p.quantity === 10.5)!.sscc, art: "41100.0451", qty: "10.5", free: "10.5" },
    ])
    const reader = await userClient(w.username.reader)
    const { data } = await reader.from("stock_by_article").select("*").eq("tenant_id", w.tenant)
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ stock: 30.5, qs_blocked: 4, blocked: 2, blocked_total: 6, available: 24.5 })

    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    const row = page.getByRole("row", { name: /41100\.0451/ })
    await expect(row).toContainText("30,5")
    await expect(row).toContainText("24,5")
  })

  test("AC: empty state with a hint to the import when no stock exists", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    await expect(page.getByText("Noch kein Lagerbestand vorhanden")).toBeVisible()
    await page.getByRole("link", { name: "Zum Import" }).click()
    await expect(page.getByRole("button", { name: "Vorschau erstellen" })).toBeVisible()

    await page.context().clearCookies()
    await login(page, w.username.reader)
    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    await expect(page.getByText("Noch kein Lagerbestand vorhanden")).toBeVisible()
    await expect(page.getByRole("link", { name: "Zum Import" })).toHaveCount(0)
  })

  test("AC: users without read access to 'Lagerbestand' are denied (page, API, database)", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const s = sscc()
    await commit(page, w.tenant, [{ sscc: s, art: "41100.0451" }])
    const pos = (await position(w.tenant, s, "41100.0451"))!

    await page.context().clearCookies()
    await login(page, w.username.none)
    await page.goto(`/lagerbestand?mandant=${w.tenant}`)
    await expect(page.getByText("Du hast in keinem Mandanten Zugriff auf den Lagerbestand.")).toBeVisible()
    await expect(page.getByRole("link", { name: "Lagerbestand" })).toHaveCount(0) // no sidebar entry
    expect((await page.request.get(`/api/tenants/${w.tenant}/stock/positions/${pos.id}`)).status()).toBe(403)
    expect((await upload(page, w.tenant, "preview", csv([]))).status()).toBe(403)

    const none = await userClient(w.username.none)
    for (const table of ["stock_positions", "stock_imports", "stock_import_positions", "stock_position_list", "stock_by_article"]) {
      const { data, error } = await none.from(table).select("*").eq("tenant_id", w.tenant)
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
  })

  test("AC: LHM list filters and paginates on the server (status, SSCC, article number, mixed pallet)", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const base = String(Date.now()).slice(-9)
    const rows = Array.from({ length: 55 }, (_, i) => ({
      tenant_id: w.tenant, sscc: `9${base}${String(i).padStart(8, "0")}`, article_number: i < 5 ? "41100.0499" : "41100.0451",
      quantity: 1, free_quantity: 1, qs_quantity: 0, blocked_quantity: 0, qs_and_blocked_quantity: 0,
      status: i % 11 === 0 ? "shipped" : "in_stock",
    }))
    expect((await admin.from("stock_positions").insert(rows)).error).toBeNull()

    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm`)
    await expect(page.locator("tbody tr")).toHaveCount(25)
    await expect(page.getByText(/55/).first()).toBeVisible()
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm&seite=3`)
    await expect(page.locator("tbody tr")).toHaveCount(5)

    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm&status=shipped`)
    await expect(page.locator("tbody tr")).toHaveCount(rows.filter((r) => r.status === "shipped").length)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm&q=41100.0499`)
    await expect(page.locator("tbody tr")).toHaveCount(5)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm&q=${rows[7].sscc}`)
    await expect(page.locator("tbody tr")).toHaveCount(1)
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm&q=nichtvorhanden`)
    await expect(page.getByText("Keine LHM gefunden")).toBeVisible()
  })
})

// ===============================================================================================
// Mandanten
// ===============================================================================================
test.describe("Mandanten", () => {
  test("AC: the same SSCC may exist in different tenants; each user only sees and changes the own tenant", async ({ page, browser }, testInfo) => {
    const w = await mkWorld(testInfo)
    const shared = sscc()
    await login(page, w.username.writer)
    await commit(page, w.tenant, [{ sscc: shared, art: "41100.0451", qty: 1 }])

    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const foreign = await ctx.newPage()
    try {
      await login(foreign, w.username.foreign)
      await commit(foreign, w.other, [{ sscc: shared, art: "41100.0451", qty: 2 }, { sscc: sscc(), art: "41100.0452" }])
      expect(await positions(w.tenant)).toHaveLength(1)
      expect(await positions(w.other)).toHaveLength(2)

      // re-importing in tenant B does not mark tenant A's stock as missing (and vice versa)
      await commit(foreign, w.other, [])
      expect((await positions(w.tenant)).every((p) => p.status === "in_stock")).toBe(true)

      // cross-tenant access through the API of the other tenant
      const posA = (await position(w.tenant, shared, "41100.0451"))!
      expect((await foreign.request.get(`/api/tenants/${w.tenant}/stock/positions/${posA.id}`)).status()).toBe(403)
      expect((await upload(foreign, w.tenant, "commit", csv([]))).status()).toBe(403)
      expect((await check(foreign, w.tenant, posA.id, { expectedStatus: "missing_unchecked" })).status()).toBe(403)
      // position of tenant A addressed through own tenant B → not found, nothing changes
      expect((await check(foreign, w.other, posA.id, { expectedStatus: "missing_unchecked" })).status()).toBe(404)
      expect((await ship(foreign, w.other, posA.id, { expectedStatus: "missing_unchecked" })).status()).toBe(404)
      expect((await foreign.request.get(`/api/tenants/${w.other}/stock/positions/${posA.id}`)).status()).toBe(404)

      // …and straight through the database with the foreign user's token
      const client = await userClient(w.username.foreign)
      for (const table of ["stock_positions", "stock_imports", "stock_import_positions", "stock_position_list", "stock_by_article"]) {
        const { data } = await client.from(table).select("tenant_id")
        expect((data ?? []).every((r) => r.tenant_id === w.other), table).toBe(true)
        const own = await client.from(table).select("tenant_id").eq("tenant_id", w.tenant)
        expect(own.data ?? [], table).toEqual([])
      }
    } finally {
      await ctx.close()
    }
  })
})

// ===============================================================================================
// Security (red team)
// ===============================================================================================
test.describe("Security", () => {
  test("clients cannot write the stock tables directly or call internal functions", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const s = sscc()
    await commit(page, w.tenant, [{ sscc: s, art: "41100.0451", qty: 5 }])
    const pos = (await position(w.tenant, s, "41100.0451"))!

    for (const username of [w.username.writer, w.username.reader]) {
      const client = await userClient(username)
      const insert = await client.from("stock_positions").insert({
        tenant_id: w.tenant, sscc: sscc(), article_number: "41100.0452", quantity: 1, free_quantity: 1,
        qs_quantity: 0, blocked_quantity: 0, qs_and_blocked_quantity: 0,
      })
      expect(insert.error, `${username} insert`).not.toBeNull()
      const update = await client.from("stock_positions").update({ quantity: 999, status: "shipped" }).eq("id", pos.id).select("id")
      expect(update.data ?? [], `${username} update`).toEqual([])
      const del = await client.from("stock_positions").delete().eq("id", pos.id).select("id")
      expect(del.data ?? [], `${username} delete`).toEqual([])
      expect((await client.from("stock_imports").insert({ tenant_id: w.tenant, file_name: "x", record_count: 0 })).error).not.toBeNull()
      expect((await client.from("stock_imports").delete().eq("tenant_id", w.tenant).select("id")).data ?? []).toEqual([])
      expect((await client.rpc("stock_cleanup")).error, `${username} cleanup`).not.toBeNull()
    }
    expect(await position(w.tenant, s, "41100.0451")).toMatchObject({ quantity: 5, status: "in_stock" })

    // anonymous callers
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    expect((await anon.rpc("stock_cleanup")).error).not.toBeNull()
    expect((await anon.rpc("stock_import", { p_tenant_id: w.tenant, p_file_name: "x", p_record_count: 0, p_records: [], p_excluded: [], p_skipped: [], p_errors: [], p_commit: true })).error).not.toBeNull()
    expect((await anon.from("stock_position_list").select("*")).data ?? []).toEqual([])
  })

  test("direct RPC calls respect the mask right and the table constraints", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    const args = (tenant: string, records: unknown[], commitIt = true) => ({
      p_tenant_id: tenant, p_file_name: "rpc.csv", p_record_count: records.length, p_records: records,
      p_excluded: [], p_skipped: [], p_errors: [], p_commit: commitIt,
    })
    const rec = (over: Record<string, unknown> = {}) => ({
      sscc: sscc(), article_number: "41100.0451", quantity: 1, free_quantity: 1, qs_quantity: 0,
      blocked_quantity: 0, qs_and_blocked_quantity: 0, unit: null, logistics_center: null, stock_group: null, ...over,
    })
    const reader = await userClient(w.username.reader)
    expect((await reader.rpc("stock_import", args(w.tenant, [rec()], false))).error?.code).toBe("42501")
    const foreign = await userClient(w.username.foreign)
    expect((await foreign.rpc("stock_import", args(w.tenant, [rec()]))).error?.code).toBe("42501")

    const writer = await userClient(w.username.writer)
    for (const bad of [
      rec({ sscc: "12ab" }), rec({ article_number: "41100.451" }), rec({ quantity: -1 }), rec({ unit: "x".repeat(101) }),
    ]) {
      const res = await writer.rpc("stock_import", args(w.tenant, [bad]))
      expect(res.error, JSON.stringify(bad)).not.toBeNull()
    }
    const dupKey = rec()
    expect((await writer.rpc("stock_import", args(w.tenant, [dupKey, dupKey]))).error).not.toBeNull()
    expect((await writer.rpc("stock_import", { ...args(w.tenant, []), p_records: "nope" })).error?.code).toBe("22023")
    expect(await positions(w.tenant)).toHaveLength(0)
    expect((await admin.from("stock_imports").select("id").eq("tenant_id", w.tenant)).data).toHaveLength(0)

    // a valid direct call works and is a full snapshot like the route
    const good = await writer.rpc("stock_import", args(w.tenant, [rec()]))
    expect(good.error).toBeNull()
    expect(await positions(w.tenant)).toHaveLength(1)
  })

  test("injection and XSS: search input and file contents are treated as data", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const s = sscc()
    const payload = "&lt;img src=x onerror=window.__xss=1&gt;"
    await commit(page, w.tenant, [{ sscc: s, art: "41100.0451", unit: payload, lz: "&lt;script&gt;window.__xss=2&lt;/script&gt;" }])
    expect((await position(w.tenant, s, "41100.0451"))!.unit).toBe("<img src=x onerror=window.__xss=1>")

    const logged: string[] = []
    page.on("dialog", async (d) => { logged.push(d.message()); await d.dismiss() })
    await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=lhm`)
    await page.getByRole("button", { name: new RegExp(`Details zu SSCC ${s}`) }).click()
    await expect(page.getByRole("dialog")).toContainText("<img src=x onerror=window.__xss=1>")
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    expect(logged).toEqual([])

    for (const q of ["'; drop table stock_positions; --", "%27%20OR%201=1", "a,article_number.ilike.%", "x),status.eq.shipped", '")', "\\", "\u0000"]) {
      for (const reiter of ["lhm", "bestand"]) {
        const res = await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=${reiter}&q=${encodeURIComponent(q)}`)
        expect(res!.status(), q).toBeLessThan(500)
        // the page renders its result (rows or "nothing found"), never the load-error alert of a broken query
        await expect(page.getByRole("heading", { name: "Lagerbestand", level: 1 })).toBeVisible()
        await expect(page.locator("tbody tr").or(page.getByText(/Keine (LHM|Artikel) gefunden/)).first()).toBeVisible()
        await expect(page.getByText("Daten konnten nicht geladen werden")).toHaveCount(0)
      }
    }
    expect(await positions(w.tenant)).toHaveLength(1)
    const res = await page.goto(`/lagerbestand?mandant=${w.tenant}&seite=abc&status=%27&reiter=%00&unbekannt=x`)
    expect(res!.status()).toBeLessThan(500)
  })

  test("entity expansion and DOCTYPE in the XML do not crash or hang the server", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const laugh = ["<!DOCTYPE lolz [", '<!ENTITY lol "lol">', '<!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
      '<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">',
      '<!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">', "]>"].join("\n")
    const body = `${laugh}\n<BestandDaten><sscc>${sscc()}</sscc><p_artikel-p_artikelnr>41100.0451</p_artikel-p_artikelnr><menge>&lol4;</menge><freieMenge>1</freieMenge><qsMenge>0</qsMenge><sperrMenge>0</sperrMenge><qsUndSperrMenge>0</qsUndSperrMenge><p_einheitMenge-p_name>&lol4;</p_einheitMenge-p_name></BestandDaten>`
    const file = Buffer.from([
      CSV_HEADER,
      csvLine("BestandEnde", "x", "done", "<BestandEnde><anzahlDatensaetze>1</anzahlDatensaetze></BestandEnde>"),
      csvLine("BestandDaten", "41100.0451", "done", body),
    ].join("\r\n"))
    const started = Date.now()
    const res = await upload(page, w.tenant, "commit", file)
    expect(res.status()).toBeLessThan(500)
    expect(Date.now() - started).toBeLessThan(10_000)
    for (const p of await positions(w.tenant)) expect((p.unit ?? "").length).toBeLessThanOrEqual(100)
  })

  test("a file above the size limit is refused with 413 and does not change anything", async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const res = await upload(page, w.tenant, "preview", Buffer.alloc(26 * 1024 * 1024, 65))
    expect([400, 413]).toContain(res.status())
    expect((await res.json()).error).toBeTruthy()
    expect(await positions(w.tenant)).toHaveLength(0)
  })

  test("API responses contain no secrets or internal data", async ({ page }, testInfo) => {
    const w = await mkWorld(testInfo)
    await login(page, w.username.writer)
    const s = sscc()
    const out = await upload(page, w.tenant, "commit", csv([{ sscc: s, art: "41100.0451" }]))
    const pos = (await position(w.tenant, s, "41100.0451"))!
    const detail = await page.request.get(`/api/tenants/${w.tenant}/stock/positions/${pos.id}`)
    for (const res of [out, detail]) {
      const text = await res.text()
      expect(text).not.toMatch(/service_role|eyJhbGci|password|SUPABASE|stack|at .*\.ts:\d+/i)
    }
    // error responses do not leak SQL details either
    const err = await check(page, w.tenant, "00000000-0000-4000-8000-000000000000", { expectedStatus: "missing_unchecked" })
    expect(await err.text()).not.toMatch(/relation|syntax|pg_|violates|stock_positions/i)
    const detailBody = await detail.json()
    expect(Object.keys(detailBody)).not.toContain("tenant_id")
  })
})

// ===============================================================================================
// Responsive (375 / 768 / 1440)
// ===============================================================================================
test.describe("Responsive", () => {
  for (const [label, width, height] of [["mobile", 375, 800], ["tablet", 768, 1000], ["desktop", 1440, 900]] as const) {
    test(`no horizontal page overflow at ${label} (${width}px) on all tabs`, async ({ page }, testInfo) => {
      const w = await mkWorld(testInfo)
      await login(page, w.username.writer)
      const rows = Array.from({ length: 6 }, (_, i) => ({ sscc: sscc(), art: `${w.baseCode}.04${50 + i}`, qty: 1234567.5 }))
      await commit(page, w.tenant, rows)
      await commit(page, w.tenant, rows.slice(0, 3))
      await page.setViewportSize({ width, height })
      for (const reiter of ["bestand", "lhm", "pruefliste", "import"]) {
        await page.goto(`/lagerbestand?mandant=${w.tenant}&reiter=${reiter}`)
        await expect(page.getByRole("heading", { name: "Lagerbestand", level: 1 })).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${reiter} @${width}`).toBeLessThanOrEqual(1)
      }
      await page.screenshot({ path: testInfo.outputPath(`lager-${label}.png`) })
    })
  }
})
