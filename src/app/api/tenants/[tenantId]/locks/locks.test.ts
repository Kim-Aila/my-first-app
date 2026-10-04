import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST, DELETE } = await import("./route")

const ARTICLE = "77777777-7777-4777-8777-777777777777"
const base = `http://localhost/api/tenants/${IDS.tenant}/locks`
const body = { resourceType: "article", resourceId: ARTICLE }

const post = (payload: unknown) =>
  POST(jsonRequest(base, "POST", payload), routeParams({ tenantId: IDS.tenant }))
const del = (query: string) =>
  DELETE(jsonRequest(`${base}?${query}`, "DELETE"), routeParams({ tenantId: IDS.tenant }))

const EXPIRES = "2026-10-04T12:15:00.000Z"

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants/:tenantId/locks", () => {
  it("returns the expiry when the lock is acquired or renewed (200)", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:acquire_edit_lock", {
      data: [{ out_acquired: true, out_holder_username: null, out_expires_at: EXPIRES }],
    })
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expiresAt: EXPIRES })
    expect(server.rpc).toHaveBeenCalledWith("acquire_edit_lock", {
      p_tenant_id: IDS.tenant,
      p_resource_type: "article",
      p_resource_id: ARTICLE,
    })
  })

  it("returns 409 naming the user who currently holds the lock", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:acquire_edit_lock", {
      data: [{ out_acquired: false, out_holder_username: "anna", out_expires_at: EXPIRES }],
    })
    const res = await post(body)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.lockedBy).toEqual({ username: "anna", expiresAt: EXPIRES })
    expect(data.error).toContain("anna")
    expect(data.error).toContain("Artikel")
  })

  it("returns 403 when the database denies the mask right", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:acquire_edit_lock", {
      error: { message: "Dafür fehlt dir die Berechtigung.", code: "42501" },
    })
    expect((await post(body)).status).toBe(403)
  })

  it("returns 400 for an unknown resource type", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:acquire_edit_lock", {
      error: { message: "Unbekannter Datensatztyp.", code: "22023" },
    })
    expect((await post({ ...body, resourceType: "order" })).status).toBe(400)
  })

  it("returns 400 for invalid input without calling the database", async () => {
    server.loginAs({ id: IDS.caller })
    expect((await post({ resourceType: "article", resourceId: "nope" })).status).toBe(400)
    expect((await post({ resourceId: ARTICLE })).status).toBe(400)
    expect(server.rpc).not.toHaveBeenCalled()
  })

  it("returns 401 without a session and 404 for a bad tenant id", async () => {
    expect((await post(body)).status).toBe(401)
    const res = await POST(jsonRequest(base, "POST", body), routeParams({ tenantId: "nope" }))
    expect(res.status).toBe(404)
  })

  it("returns a generic 500 on unexpected errors", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:acquire_edit_lock", { error: { message: "boom", code: "XX000" } })
    const res = await post(body)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("boom")
  })
})

describe("DELETE /api/tenants/:tenantId/locks", () => {
  it("releases the own lock (204)", async () => {
    server.loginAs({ id: IDS.caller })
    const res = await del(`resourceType=article&resourceId=${ARTICLE}`)
    expect(res.status).toBe(204)
    expect(server.rpc).toHaveBeenCalledWith("release_edit_lock", {
      p_tenant_id: IDS.tenant,
      p_resource_type: "article",
      p_resource_id: ARTICLE,
    })
  })

  it("returns 400 for missing or invalid query parameters", async () => {
    server.loginAs({ id: IDS.caller })
    expect((await del("resourceType=article")).status).toBe(400)
    expect((await del("resourceType=article&resourceId=nope")).status).toBe(400)
    expect(server.rpc).not.toHaveBeenCalled()
  })

  it("returns 401 without a session", async () => {
    expect((await del(`resourceType=article&resourceId=${ARTICLE}`)).status).toBe(401)
  })
})
