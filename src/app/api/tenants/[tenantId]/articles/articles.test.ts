import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST } = await import("./route")
const { PATCH } = await import("./[articleId]/route")
const { PATCH: PATCH_STATUS } = await import("./[articleId]/status/route")

const ARTICLE = "77777777-7777-4777-8777-777777777777"
const BASE = "88888888-8888-4888-8888-888888888888"
const SEASON = "99999999-9999-4999-8999-999999999999"

const valid = { baseArticleId: BASE, kennziffer: "0042" }
const base = `http://localhost/api/tenants/${IDS.tenant}/articles`

const post = (body: unknown) =>
  POST(jsonRequest(base, "POST", body), routeParams({ tenantId: IDS.tenant }))
const patch = (body: unknown) =>
  PATCH(
    jsonRequest(`${base}/${ARTICLE}`, "PATCH", body),
    routeParams({ tenantId: IDS.tenant, articleId: ARTICLE })
  )
const patchStatus = (body: unknown) =>
  PATCH_STATUS(
    jsonRequest(`${base}/${ARTICLE}/status`, "PATCH", body),
    routeParams({ tenantId: IDS.tenant, articleId: ARTICLE })
  )

function asWriter() {
  server.loginAs({ id: IDS.caller })
  server.respond("rpc:mask_access_level", { data: "write" })
}

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants/:tenantId/articles", () => {
  it("creates the article with only the required fields and maps snake_case columns (201)", async () => {
    asWriter()
    server.respond("articles:insert", { data: { id: ARTICLE, article_number: "12000042" } })

    const res = await post({ ...valid, name: " Tafel ", weight: 12.5, isMixed: true, mixedCount: 3 })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: ARTICLE, articleNumber: "12000042" })

    const payload = server.callsTo("articles", "insert")[0].payload as Record<string, unknown>
    expect(payload).toMatchObject({
      tenant_id: IDS.tenant,
      base_article_id: BASE,
      kennziffer: "0042",
      name: "Tafel",
      weight: 12.5,
      is_mixed: true,
      mixed_count: 3,
      season_id: null,
      fairtrade: false,
    })
  })

  it("ignores client-supplied computed fields (number, commodity group, gross weight)", async () => {
    asWriter()
    server.respond("articles:insert", { data: { id: ARTICLE, article_number: "12000042" } })

    await post({ ...valid, articleNumber: "FAKE", commodityGroup: "999", grossWeight: 5 })
    const payload = server.callsTo("articles", "insert")[0].payload as Record<string, unknown>
    expect(payload).not.toHaveProperty("article_number")
    expect(payload).not.toHaveProperty("commodity_group")
    expect(payload).not.toHaveProperty("gross_weight")
  })

  it("drops the mixed count when the article is not a Mischartikel", async () => {
    asWriter()
    server.respond("articles:insert", { data: { id: ARTICLE, article_number: "x" } })
    await post({ ...valid, isMixed: false, mixedCount: 4 })
    expect(server.callsTo("articles", "insert")[0].payload).toMatchObject({ mixed_count: null })
  })

  it("returns 401 without a session", async () => {
    const res = await post(valid)
    expect(res.status).toBe(401)
    expect(server.callsTo("articles", "insert")).toHaveLength(0)
  })

  it("returns 403 for a read-only user", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    const res = await post(valid)
    expect(res.status).toBe(403)
    expect(server.callsTo("articles", "insert")).toHaveLength(0)
  })

  it("returns 403 for a user without the mask", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: null })
    expect((await post(valid)).status).toBe(403)
  })

  it("lets super-admins skip the mask lookup", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("articles:insert", { data: { id: ARTICLE, article_number: "x" } })
    expect((await post(valid)).status).toBe(201)
    expect(server.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["kennziffer too short", { ...valid, kennziffer: "123" }, "kennziffer"],
    ["kennziffer with letters", { ...valid, kennziffer: "12a4" }, "kennziffer"],
    ["missing base article", { kennziffer: "0042" }, "baseArticleId"],
    ["invalid base article id", { ...valid, baseArticleId: "nope" }, "baseArticleId"],
    ["negative weight", { ...valid, weight: -1 }, "weight"],
    ["GTIN with letters", { ...valid, gtinMain: "40abc" }, "gtinMain"],
    ["name too long", { ...valid, name: "x".repeat(201) }, "name"],
    ["fractional carton content", { ...valid, cartonContent: 1.5 }, "cartonContent"],
  ])("returns 400 with the field for %s", async (_label, body, field) => {
    asWriter()
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe(field)
    expect(server.callsTo("articles", "insert")).toHaveLength(0)
  })

  it("returns 409 'Artikelnummer bereits vergeben' on a duplicate number", async () => {
    asWriter()
    server.respond("articles:insert", { error: { message: "duplicate key", code: "23505" } })
    const res = await post(valid)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe("Artikelnummer bereits vergeben")
    expect(data.field).toBe("kennziffer")
  })

  it("returns 400 when a reference belongs to another tenant (FK violation)", async () => {
    asWriter()
    server.respond("articles:insert", {
      error: { message: 'violates foreign key constraint "articles_season_id_tenant_id_fkey"', code: "23503" },
    })
    const res = await post({ ...valid, seasonId: SEASON })
    expect(res.status).toBe(400)
  })

  it("passes through the German message when a deactivated Merkmal is chosen", async () => {
    asWriter()
    server.respond("articles:insert", {
      error: { message: "Ein gewählter Merkmal-Eintrag ist deaktiviert und kann nicht neu verwendet werden.", code: "23514" },
    })
    const res = await post(valid)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/deaktiviert/)
  })

  it("returns a generic 500 for unexpected database errors without leaking details", async () => {
    asWriter()
    server.respond("articles:insert", { error: { message: "secret internals", code: "XX000" } })
    const res = await post(valid)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("secret")
  })

  it("returns 404 for a non-UUID tenant id", async () => {
    const res = await POST(jsonRequest(base, "POST", valid), routeParams({ tenantId: "nope" }))
    expect(res.status).toBe(404)
  })
})

describe("PATCH /api/tenants/:tenantId/articles/:articleId", () => {
  it("saves the article, scoped to id + tenant, and releases the lock (200)", async () => {
    asWriter()
    server.respond("articles:update", { data: { id: ARTICLE, article_number: "12000042" } })

    const res = await patch({ ...valid, name: "Neu" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ARTICLE, articleNumber: "12000042" })

    const call = server.callsTo("articles", "update")[0]
    expect(call.payload).toMatchObject({ name: "Neu", kennziffer: "0042" })
    expect(call.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: ARTICLE },
        { method: "eq", column: "tenant_id", value: IDS.tenant },
      ])
    )
    expect(server.rpc).toHaveBeenCalledWith("release_edit_lock", {
      p_tenant_id: IDS.tenant,
      p_resource_type: "article",
      p_resource_id: ARTICLE,
    })
  })

  it("returns 409 with the locking user's name when someone else holds the lock", async () => {
    asWriter()
    const message = "Der Artikel wird gerade von anna bearbeitet. Bitte versuche es später erneut."
    server.respond("articles:update", { error: { message, code: "55P03" } })
    const res = await patch(valid)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("anna")
  })

  it("returns 409 when the own lock has expired", async () => {
    asWriter()
    server.respond("articles:update", {
      error: { message: "Deine Bearbeitungssperre ist abgelaufen. Bitte sperre den Artikel erneut, bevor du speicherst.", code: "55P03" },
    })
    const res = await patch(valid)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/abgelaufen/)
  })

  it("returns 404 if the article does not exist in this tenant", async () => {
    asWriter()
    server.respond("articles:update", { data: null })
    expect((await patch(valid)).status).toBe(404)
    expect(server.rpc).not.toHaveBeenCalledWith("release_edit_lock", expect.anything())
  })

  it("returns 403 for a read-only user and 401 without session", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await patch(valid)).status).toBe(403)
    server.reset()
    expect((await patch(valid)).status).toBe(401)
  })

  it("returns 400 for an invalid body", async () => {
    asWriter()
    expect((await patch({ ...valid, kennziffer: "1" })).status).toBe(400)
  })
})

describe("PATCH /api/tenants/:tenantId/articles/:articleId/status", () => {
  it("deactivates the article (200)", async () => {
    asWriter()
    server.respond("articles:update", { data: { id: ARTICLE, is_active: false } })
    const res = await patchStatus({ isActive: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ARTICLE, isActive: false })
    expect(server.callsTo("articles", "update")[0].payload).toEqual({ is_active: false })
  })

  it("returns 409 with the locking user's name when the article is locked by someone else", async () => {
    asWriter()
    server.respond("articles:update", {
      error: { message: "Der Artikel wird gerade von anna bearbeitet. Bitte versuche es später erneut.", code: "55P03" },
    })
    const res = await patchStatus({ isActive: false })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("anna")
  })

  it("returns 400 for a missing/invalid status, 403 for read-only, 404 for unknown article", async () => {
    asWriter()
    expect((await patchStatus({})).status).toBe(400)
    server.respond("rpc:mask_access_level", { data: "write" })
    expect((await patchStatus({ isActive: "no" })).status).toBe(400)

    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await patchStatus({ isActive: false })).status).toBe(403)

    server.reset()
    asWriter()
    server.respond("articles:update", { data: null })
    expect((await patchStatus({ isActive: false })).status).toBe(404)
  })
})
