import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST: PREVIEW } = await import("./imports/preview/route")
const { POST: IMPORT } = await import("./imports/route")
const { GET: DETAIL } = await import("./positions/[positionId]/route")
const { POST: CHECK } = await import("./positions/[positionId]/check/route")
const { POST: SHIP } = await import("./positions/[positionId]/ship/route")

const POSITION = "77777777-7777-4777-8777-777777777777"
const base = `http://localhost/api/tenants/${IDS.tenant}/stock`

const HEADER =
  "Erstellungszeitpunkt;beendet;Record-Type;Job-Number;Sub-Job-Number;Artikelnummer;Sequenz-Nummer;Referenznummer;Status;Daten;erzeugter Dateiname;Host;Synchrone Verarbeitung;Dateiname;Fehlertexte (mehrsprachig)"

function csvRow(type: string, xml: string) {
  return `x;x;${type};1;0;X;1;ref;done;"${xml}";;1;false;;`
}

const dataXml =
  "<BestandDaten><sscc>340029968001086602</sscc><p_artikel-p_artikelnr>41100.451</p_artikel-p_artikelnr>" +
  "<menge>48.0</menge><freieMenge>48.0</freieMenge><qsMenge>0.0</qsMenge><sperrMenge>0.0</sperrMenge>" +
  "<qsUndSperrMenge>0.0</qsUndSperrMenge><p_einheitMenge-p_name>Karton</p_einheitMenge-p_name>" +
  "<logistikzentrum>HERFORD</logistikzentrum><bestandslagergruppe>ALL_HERFORD</bestandslagergruppe></BestandDaten>"

const validCsv = [
  HEADER,
  csvRow("BestandEnde", "<BestandEnde><anzahlDatensaetze>1</anzahlDatensaetze></BestandEnde>"),
  csvRow("BestandDaten", dataXml),
  csvRow("BestandStart", "<BestandStart/>"),
].join("\r\n")

/** Minimaler Request mit `formData()` — unabhängig von jsdom/undici-File-Klassen. */
function uploadRequest(content: string | null, name = "Bestand.csv", size?: number) {
  const bytes = new TextEncoder().encode(content ?? "")
  const file =
    content === null
      ? null
      : { name, size: size ?? bytes.length, arrayBuffer: async () => bytes.buffer as ArrayBuffer }
  return { formData: async () => ({ get: () => file }) } as unknown as Request
}

const tenantParams = routeParams({ tenantId: IDS.tenant })
const positionParams = routeParams({ tenantId: IDS.tenant, positionId: POSITION })

function login(level: "read" | "write") {
  server.loginAs({ id: IDS.caller })
  server.respond("rpc:mask_access_level", { data: level })
}

const outcome = {
  fileName: "Bestand.csv",
  recordCount: 1,
  counts: { new: 1, changed: 0, unchanged: 0, missing: 0, reappeared: 0 },
  skippedCount: 0,
  skipped: [],
  errors: [],
  unknownArticles: ["41100.0451"],
}

function importCall() {
  return server.rpc.mock.calls.find(([fn]) => fn === "stock_import")?.[1] as Record<string, unknown> | undefined
}

beforeEach(() => {
  server.reset()
})

describe.each([
  ["preview", PREVIEW, false, 200],
  ["import", IMPORT, true, 201],
] as const)("POST stock/imports (%s)", (_name, handler, commit, successStatus) => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await handler(uploadRequest(validCsv), tenantParams)
    expect(res.status).toBe(401)
    expect(importCall()).toBeUndefined()
  })

  it("rejects a read-only user (403)", async () => {
    login("read")
    const res = await handler(uploadRequest(validCsv), tenantParams)
    expect(res.status).toBe(403)
    expect(importCall()).toBeUndefined()
  })

  it("rejects a missing file (400)", async () => {
    login("write")
    const res = await handler(uploadRequest(null), tenantParams)
    expect(res.status).toBe(400)
    expect(importCall()).toBeUndefined()
  })

  it("rejects a too large file (413)", async () => {
    login("write")
    const res = await handler(uploadRequest(validCsv, "x.csv", 26 * 1024 * 1024), tenantParams)
    expect(res.status).toBe(413)
    expect(importCall()).toBeUndefined()
  })

  it("rejects an unreadable or incomplete file with a readable message and does not call the database (400)", async () => {
    login("write")
    const res = await handler(uploadRequest([HEADER, csvRow("BestandDaten", dataXml)].join("\r\n")), tenantParams)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("BestandEnde")
    expect(importCall()).toBeUndefined()
  })

  it("rejects an invalid tenant id (404)", async () => {
    const res = await handler(uploadRequest(validCsv), routeParams({ tenantId: "nope" }))
    expect(res.status).toBe(404)
  })

  it(`passes the parsed file to stock_import with commit=${commit} (${successStatus})`, async () => {
    login("write")
    server.respond("rpc:stock_import", { data: outcome })
    const res = await handler(uploadRequest(validCsv, "Bestand.csv"), tenantParams)
    expect(res.status).toBe(successStatus)
    expect(await res.json()).toEqual(outcome)

    expect(importCall()).toMatchObject({
      p_tenant_id: IDS.tenant,
      p_file_name: "Bestand.csv",
      p_record_count: 1,
      p_commit: commit,
      p_excluded: [],
      p_skipped: [],
      p_errors: [],
    })
    expect((importCall()?.p_records as unknown[])[0]).toMatchObject({
      sscc: "340029968001086602",
      article_number: "41100.0451",
      quantity: 48,
      unit: "Karton",
    })
  })

  it("maps a running import (55P03) to 409 with the database message", async () => {
    login("write")
    server.respond("rpc:stock_import", {
      error: { code: "55P03", message: "Für diesen Mandanten läuft bereits ein Import." },
    })
    const res = await handler(uploadRequest(validCsv), tenantParams)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("läuft bereits ein Import")
  })

  it("maps a missing database permission (42501) to 403", async () => {
    login("write")
    server.respond("rpc:stock_import", { error: { code: "42501", message: "x" } })
    expect((await handler(uploadRequest(validCsv), tenantParams)).status).toBe(403)
  })

  it("hides unexpected database errors (500)", async () => {
    login("write")
    server.respond("rpc:stock_import", { error: { code: "XX000", message: "secret detail" } })
    const res = await handler(uploadRequest(validCsv), tenantParams)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("secret detail")
  })
})

describe("GET stock/positions/:id", () => {
  const get = (params = positionParams) => DETAIL(new Request(`${base}/positions/${POSITION}`), params)

  const row = {
    id: POSITION,
    sscc: "340029968001086602",
    article_number: "41100.0451",
    article_id: null,
    article_name: null,
    quantity: 48,
    free_quantity: 48,
    qs_quantity: 0,
    blocked_quantity: 0,
    qs_and_blocked_quantity: 0,
    unit: "Karton",
    status: "missing_checked",
    is_mixed_pallet: false,
    last_seen_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    logistics_center: "HERFORD",
    stock_group: "ALL_HERFORD",
    first_seen_at: "2026-10-01T10:00:00Z",
    checked_by_name: "lager",
    checked_at: "2026-10-10T11:00:00Z",
    check_remark: "Palette umgelagert",
    shipped_by_name: null,
    shipped_at: null,
  }

  it("rejects unauthenticated requests (401)", async () => {
    expect((await get()).status).toBe(401)
  })

  it("rejects users without the mask (403)", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: null })
    expect((await get()).status).toBe(403)
  })

  it("rejects an invalid id (404)", async () => {
    const res = await get(routeParams({ tenantId: IDS.tenant, positionId: "nope" }))
    expect(res.status).toBe(404)
  })

  it("returns 404 for an unknown position", async () => {
    login("read")
    expect((await get()).status).toBe(404)
  })

  it("returns the position with check info and the import history for a read-only user", async () => {
    login("read")
    server.respond("stock_position_list:select", { data: row })
    server.respond("stock_import_positions:select", {
      data: [
        { created_at: "2026-10-09T10:00:00Z", stock_imports: { id: "i2", file_name: "b.csv", user_name: "lager", created_at: "2026-10-09T10:00:00Z" } },
        { created_at: "2026-10-01T10:00:00Z", stock_imports: [{ id: "i1", file_name: "a.csv", user_name: null, created_at: "2026-10-01T10:00:00Z" }] },
      ],
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: POSITION,
      articleNumber: "41100.0451",
      articleId: null,
      status: "missing_checked",
      logisticsCenter: "HERFORD",
      stockGroup: "ALL_HERFORD",
      checkedByName: "lager",
      checkRemark: "Palette umgelagert",
      shippedAt: null,
      imports: [
        { id: "i2", fileName: "b.csv", userName: "lager", createdAt: "2026-10-09T10:00:00Z" },
        { id: "i1", fileName: "a.csv", userName: null, createdAt: "2026-10-01T10:00:00Z" },
      ],
    })
    const filters = server.callsTo("stock_position_list", "select")[0].filters
    expect(filters).toContainEqual({ method: "eq", column: "tenant_id", value: IDS.tenant })
    expect(filters).toContainEqual({ method: "eq", column: "id", value: POSITION })
  })

  it("returns 500 if the database fails", async () => {
    login("read")
    server.respond("stock_position_list:select", { error: { message: "boom" } })
    expect((await get()).status).toBe(500)
  })
})

describe.each([
  ["check", CHECK, "stock_check_position", "missing_checked"],
  ["ship", SHIP, "stock_ship_position", "shipped"],
] as const)("POST stock/positions/:id/%s", (action, handler, fn, newStatus) => {
  const post = (body: unknown, params = positionParams) =>
    handler(jsonRequest(`${base}/positions/${POSITION}/${action}`, "POST", body), params)
  const rpcArgs = () => server.rpc.mock.calls.find(([name]) => name === fn)?.[1] as Record<string, unknown> | undefined

  it("rejects unauthenticated requests (401)", async () => {
    expect((await post({ expectedStatus: "missing_unchecked" })).status).toBe(401)
    expect(rpcArgs()).toBeUndefined()
  })

  it("rejects a read-only user (403)", async () => {
    login("read")
    expect((await post({ expectedStatus: "missing_unchecked" })).status).toBe(403)
    expect(rpcArgs()).toBeUndefined()
  })

  it("rejects an invalid id (404)", async () => {
    const res = await post({ expectedStatus: "missing_unchecked" }, routeParams({ tenantId: IDS.tenant, positionId: "nope" }))
    expect(res.status).toBe(404)
  })

  it("rejects a missing or unknown expected status (400)", async () => {
    login("write")
    expect((await post({})).status).toBe(400)
    login("write")
    expect((await post({ expectedStatus: "gone" })).status).toBe(400)
    expect(rpcArgs()).toBeUndefined()
  })

  it(`sets the status to ${newStatus} (200)`, async () => {
    login("write")
    server.respond(`rpc:${fn}`, { data: "ok" })
    const res = await post({ expectedStatus: "missing_unchecked" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: POSITION, status: newStatus })
    expect(rpcArgs()).toMatchObject({
      p_tenant_id: IDS.tenant,
      p_position_id: POSITION,
      p_expected_status: "missing_unchecked",
    })
  })

  it("reports a changed status as 409 with a hint", async () => {
    login("write")
    server.respond(`rpc:${fn}`, { data: "conflict" })
    const res = await post({ expectedStatus: "missing_unchecked" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("Status")
  })

  it("returns 404 for an unknown position", async () => {
    login("write")
    server.respond(`rpc:${fn}`, { data: "not_found" })
    expect((await post({ expectedStatus: "missing_unchecked" })).status).toBe(404)
  })

  it("maps a database permission error to 403", async () => {
    login("write")
    server.respond(`rpc:${fn}`, { error: { code: "42501", message: "x" } })
    expect((await post({ expectedStatus: "missing_unchecked" })).status).toBe(403)
  })
})

describe("POST stock/positions/:id/check — remark", () => {
  const post = (body: unknown) =>
    CHECK(jsonRequest(`${base}/positions/${POSITION}/check`, "POST", body), positionParams)
  const remark = () =>
    (server.rpc.mock.calls.find(([name]) => name === "stock_check_position")?.[1] as Record<string, unknown>).p_remark

  it("treats the remark as optional (null)", async () => {
    login("write")
    server.respond("rpc:stock_check_position", { data: "ok" })
    expect((await post({ expectedStatus: "missing_unchecked" })).status).toBe(200)
    expect(remark()).toBeNull()
  })

  it("trims the remark and turns a blank one into null", async () => {
    login("write")
    server.respond("rpc:stock_check_position", { data: "ok" }, { data: "ok" })
    await post({ expectedStatus: "missing_unchecked", remark: "  umgelagert  " })
    expect(remark()).toBe("umgelagert")
    server.rpc.mockClear()
    login("write")
    await post({ expectedStatus: "missing_unchecked", remark: "   " })
    expect(remark()).toBeNull()
  })

  it("rejects a remark longer than 500 characters (400)", async () => {
    login("write")
    const res = await post({ expectedStatus: "missing_unchecked", remark: "x".repeat(501) })
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe("remark")
  })
})

describe("POST stock/imports — empty file guard", () => {
  const emptyCsv = [
    HEADER,
    csvRow("BestandEnde", "<BestandEnde><anzahlDatensaetze>0</anzahlDatensaetze></BestandEnde>"),
    csvRow("BestandStart", "<BestandStart/>"),
  ].join("\r\n")

  function emptyRequest(confirm: boolean) {
    const bytes = new TextEncoder().encode(emptyCsv)
    const file = { name: "leer.csv", size: bytes.length, arrayBuffer: async () => bytes.buffer as ArrayBuffer }
    return {
      formData: async () => ({ get: (key: string) => (key === "file" ? file : confirm ? "true" : null) }),
    } as unknown as Request
  }

  const wiping = { ...outcome, recordCount: 0, counts: { ...outcome.counts, new: 0, missing: 7 } }

  it("refuses to commit a 0-record file that would mark stock as missing (409) and saves nothing", async () => {
    login("write")
    server.respond("rpc:stock_import", { data: wiping })
    const res = await IMPORT(emptyRequest(false), tenantParams)
    expect(res.status).toBe(409)
    expect((await res.json()).field).toBe("confirmEmpty")
    const commits = server.rpc.mock.calls.filter(([fn, args]) => fn === "stock_import" && args?.p_commit === true)
    expect(commits).toHaveLength(0)
  })

  it("commits it with confirmEmpty=true", async () => {
    login("write")
    server.respond("rpc:stock_import", { data: wiping })
    const res = await IMPORT(emptyRequest(true), tenantParams)
    expect(res.status).toBe(201)
    expect(importCall()?.p_commit).toBe(true)
  })

  it("needs no confirmation when there is nothing to mark as missing", async () => {
    login("write")
    server.respond("rpc:stock_import", { data: { ...wiping, counts: { ...wiping.counts, missing: 0 } } })
    expect((await IMPORT(emptyRequest(false), tenantParams)).status).toBe(201)
  })

  it("never blocks the preview", async () => {
    login("write")
    server.respond("rpc:stock_import", { data: wiping })
    expect((await PREVIEW(emptyRequest(false), tenantParams)).status).toBe(200)
  })
})
