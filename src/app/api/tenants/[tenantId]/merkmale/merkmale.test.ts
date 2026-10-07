import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST } = await import("./[slug]/route")
const { PATCH } = await import("./[slug]/[itemId]/route")

const ITEM = "77777777-7777-4777-8777-777777777777"
const url = (slug: string) => `http://localhost/api/tenants/${IDS.tenant}/merkmale/${slug}`

const post = (slug: string, body: unknown) =>
  POST(jsonRequest(url(slug), "POST", body), routeParams({ tenantId: IDS.tenant, slug }))
const patch = (slug: string, body: unknown) =>
  PATCH(
    jsonRequest(`${url(slug)}/${ITEM}`, "PATCH", body),
    routeParams({ tenantId: IDS.tenant, slug, itemId: ITEM })
  )

function asWriter() {
  server.loginAs({ id: IDS.caller })
  server.respond("rpc:mask_access_level", { data: "write" })
}

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants/:tenantId/merkmale/:slug", () => {
  it("creates a Saison with its commodity digit in its own table (201)", async () => {
    asWriter()
    server.respond("seasons:insert", { data: { id: ITEM } })

    const res = await post("saisons", { code: " SOM ", name: "Sommer", commodityDigit: 3 })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: ITEM })
    expect(server.callsTo("seasons", "insert")[0].payload).toEqual({
      tenant_id: IDS.tenant,
      code: "SOM",
      name: "Sommer",
      commodity_digit: 3,
    })
  })

  it("checks the mask belonging to this Merkmal table", async () => {
    asWriter()
    server.respond("vat_rates:insert", { data: { id: ITEM } })
    await post("mehrwertsteuersaetze", { ratePercent: 19, name: "Regelsatz" })
    expect(server.rpc).toHaveBeenCalledWith("mask_access_level", {
      p_tenant_id: IDS.tenant,
      p_module: "warenwirtschaft",
      p_maske: "merkmal_mwst",
    })
    expect(server.callsTo("vat_rates", "insert")[0].payload).toEqual({
      tenant_id: IDS.tenant,
      rate_percent: 19,
      name: "Regelsatz",
    })
  })

  it("stores optional fields as null (Basisartikel without Zolltarifnummer)", async () => {
    asWriter()
    server.respond("base_articles:insert", { data: { id: ITEM } })
    await post("basisartikel", { code: "1200", name: "Tafel" })
    expect(server.callsTo("base_articles", "insert")[0].payload).toMatchObject({
      customs_tariff_number: null,
    })
  })

  it("creates a Palettenklasse in its own table with only the class (201)", async () => {
    asWriter()
    server.respond("pallet_classes:insert", { data: { id: ITEM } })
    const res = await post("palettenklassen", { code: " A " })
    expect(res.status).toBe(201)
    expect(server.rpc).toHaveBeenCalledWith("mask_access_level", {
      p_tenant_id: IDS.tenant,
      p_module: "warenwirtschaft",
      p_maske: "merkmal_palettenklasse",
    })
    expect(server.callsTo("pallet_classes", "insert")[0].payload).toEqual({
      tenant_id: IDS.tenant,
      code: "A",
    })
  })

  it("returns 409 on the field 'code' for a duplicate Palettenklasse", async () => {
    asWriter()
    server.respond("pallet_classes:insert", { error: { message: "dup", code: "23505" } })
    const res = await post("palettenklassen", { code: "A" })
    expect(res.status).toBe(409)
    expect((await res.json()).field).toBe("code")
  })

  it("maps the 4 weight fields of a Verpackungsgruppe to snake_case columns", async () => {
    asWriter()
    server.respond("packaging_groups:insert", { data: { id: ITEM } })
    await post("verpackungsgruppen", {
      name: "Karton",
      foilSystemWeight: 1.5,
      cardboardSystemWeight: 2,
      foilTransportWeight: 3,
    })
    expect(server.callsTo("packaging_groups", "insert")[0].payload).toEqual({
      tenant_id: IDS.tenant,
      name: "Karton",
      foil_system_weight: 1.5,
      cardboard_system_weight: 2,
      foil_transport_weight: 3,
      cardboard_transport_weight: null,
    })
  })

  it("returns 404 for an unknown Merkmal table", async () => {
    asWriter()
    expect((await post("unbekannt", { code: "x", name: "y" })).status).toBe(404)
  })

  it("returns 401 without session and 403 without write access", async () => {
    expect((await post("saisons", { code: "A", name: "B", commodityDigit: 1 })).status).toBe(401)
    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    const res = await post("saisons", { code: "A", name: "B", commodityDigit: 1 })
    expect(res.status).toBe(403)
    expect(server.callsTo("seasons", "insert")).toHaveLength(0)
  })

  it.each([
    ["saisons", { code: "", name: "Sommer", commodityDigit: 3 }, "code"],
    ["saisons", { code: "SOM", name: "Sommer", commodityDigit: 10 }, "commodityDigit"],
    ["saisons", { code: "SOM", name: "Sommer" }, "commodityDigit"],
    ["artikeltypen", { code: "FW", name: "Fertig", commodityDigit: "4" }, "commodityDigit"],
    ["mehrwertsteuersaetze", { ratePercent: 150, name: "x" }, "ratePercent"],
    ["verpackungsgruppen", { name: "Karton", foilTransportWeight: -1 }, "foilTransportWeight"],
    ["verpackungsgruppen", { name: "Karton", cardboardSystemWeight: "x" }, "cardboardSystemWeight"],
    ["palettenklassen", { code: "" }, "code"],
    ["palettenklassen", { code: "x".repeat(21) }, "code"],
    ["markeninhaber", { code: "x".repeat(21), name: "y" }, "code"],
  ])("returns 400 with the field for invalid %s input", async (slug, body, field) => {
    asWriter()
    const res = await post(slug, body)
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe(field)
  })

  it("returns 409 on the field 'code' for a duplicate Kürzel", async () => {
    asWriter()
    server.respond("seasons:insert", { error: { message: "dup", code: "23505" } })
    const res = await post("saisons", { code: "SOM", name: "Sommer", commodityDigit: 3 })
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("code")
  })

  it("reports duplicates of tables without Kürzel on 'name'", async () => {
    asWriter()
    server.respond("vat_rates:insert", { error: { message: "dup", code: "23505" } })
    const res = await post("mehrwertsteuersaetze", { ratePercent: 7, name: "Regelsatz" })
    expect(res.status).toBe(409)
    expect((await res.json()).field).toBe("name")
  })
})

describe("PATCH /api/tenants/:tenantId/merkmale/:slug/:itemId", () => {
  it("updates the entry, scoped to id + tenant (200)", async () => {
    asWriter()
    server.respond("pack_sizes:update", { data: { id: ITEM, is_active: true } })
    const res = await patch("packungsgroessen", { code: "100G", name: "100 g" })
    expect(res.status).toBe(200)
    const call = server.callsTo("pack_sizes", "update")[0]
    expect(call.payload).toEqual({ code: "100G", name: "100 g" })
    expect(call.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: ITEM },
        { method: "eq", column: "tenant_id", value: IDS.tenant },
      ])
    )
  })

  it("deactivates with a status-only body and changes nothing else", async () => {
    asWriter()
    server.respond("flavors:update", { data: { id: ITEM, is_active: false } })
    const res = await patch("geschmackssorten", { isActive: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ITEM, isActive: false })
    expect(server.callsTo("flavors", "update")[0].payload).toEqual({ is_active: false })
  })

  it("returns 400 for an invalid status-only body", async () => {
    asWriter()
    expect((await patch("flavors", { isActive: false })).status).toBe(404) // unknown slug
    server.respond("rpc:mask_access_level", { data: "write" })
    expect((await patch("geschmackssorten", { isActive: "ja" })).status).toBe(400)
  })

  it("returns 409 for a duplicate, 404 for a missing entry, 403 for read-only", async () => {
    asWriter()
    server.respond("seasons:update", { error: { message: "dup", code: "23505" } })
    expect((await patch("saisons", { code: "SOM", name: "x", commodityDigit: 1 })).status).toBe(409)

    server.reset()
    asWriter()
    server.respond("seasons:update", { data: null })
    expect((await patch("saisons", { code: "SOM", name: "x", commodityDigit: 1 })).status).toBe(404)

    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await patch("saisons", { isActive: false })).status).toBe(403)
  })

  it("offers no way to delete entries", async () => {
    const mod = await import("./[slug]/[itemId]/route")
    expect(Object.keys(mod)).not.toContain("DELETE")
    const slugMod = await import("./[slug]/route")
    expect(Object.keys(slugMod)).not.toContain("DELETE")
  })
})
