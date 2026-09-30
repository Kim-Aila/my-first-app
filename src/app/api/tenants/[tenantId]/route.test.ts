import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { PATCH } = await import("./route")

const patch = (body: unknown, tenantId: string = IDS.tenant) =>
  PATCH(
    jsonRequest(`http://localhost/api/tenants/${tenantId}`, "PATCH", body),
    routeParams({ tenantId })
  )

beforeEach(() => {
  server.reset()
})

describe("PATCH /api/tenants/:tenantId", () => {
  it("returns 403 for a non-super-admin (even a tenant admin of that tenant)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: false })
    server.tenantAdminRoles(true)
    const res = await patch({ name: "Neu" })
    expect(res.status).toBe(403)
    expect(server.callsTo("tenants", "update")).toHaveLength(0)
  })

  it("returns 400 for an empty name", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await patch({ name: "" })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("name")
  })

  it("returns 404 for a malformed tenant id", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await patch({ name: "Neu" }, "not-a-uuid")
    expect(res.status).toBe(404)
  })

  it("returns 409 if another tenant already has the name (unique index, case-insensitive)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:update", { error: { message: "duplicate", code: "23505" } })
    const res = await patch({ name: "süd" })
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("name")
    // No ilike pre-check anymore (BUG-10) — the database decides.
    expect(server.callsTo("tenants", "select")).toHaveLength(0)
  })

  it("renames the tenant (200)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:update", { data: { id: IDS.tenant, name: "Neu" } })
    const res = await patch({ name: " Neu " })
    expect(res.status).toBe(200)
    const update = server.callsTo("tenants", "update")[0]
    expect(update.payload).toEqual({ name: "Neu" })
    expect(update.filters).toContainEqual({ method: "eq", column: "id", value: IDS.tenant })
  })

  it("returns 404 if the tenant does not exist", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:update", { data: null })
    const res = await patch({ name: "Neu" })
    expect(res.status).toBe(404)
  })
})
