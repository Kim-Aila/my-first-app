import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => {
    throw new Error("admin client must not be used for tenant management")
  },
}))

const { POST } = await import("./route")

const post = (body: unknown) => POST(jsonRequest("http://localhost/api/tenants", "POST", body))

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants", () => {
  it("returns 401 without a session", async () => {
    const res = await post({ name: "Nord" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-super-admin", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: false })
    const res = await post({ name: "Nord" })
    expect(res.status).toBe(403)
    expect(server.callsTo("tenants", "insert")).toHaveLength(0)
  })

  it("returns 400 with field 'name' for an empty name", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await post({ name: "   " })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("name")
  })

  it("returns 400 for a name longer than 100 characters", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await post({ name: "x".repeat(101) })
    expect(res.status).toBe(400)
  })

  it("returns 409 with field 'name' if the case-insensitive unique index fires", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:insert", { error: { message: "duplicate", code: "23505" } })
    const res = await post({ name: "default" })
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("name")
  })

  it("does not pre-check with an ilike pattern — a literal '*' goes straight to the insert (BUG-10)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:insert", { data: { id: IDS.tenant, name: "Nord*" } })
    const res = await post({ name: "Nord*" })
    expect(res.status).toBe(201)
    expect(server.callsTo("tenants", "select")).toHaveLength(0)
    expect(server.calls.some((c) => c.filters.some((f) => f.method === "ilike"))).toBe(false)
    expect(server.callsTo("tenants", "insert")[0].payload).toEqual({ name: "Nord*" })
  })

  it("returns 500 for other insert errors", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:insert", { error: { message: "boom", code: "XX000" } })
    const res = await post({ name: "Nord" })
    expect(res.status).toBe(500)
  })

  it("creates the tenant with a trimmed name (201)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:insert", { data: { id: IDS.tenant, name: "Nord" } })
    const res = await post({ name: "  Nord  " })
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data).toEqual({ id: IDS.tenant, name: "Nord" })
    expect(server.callsTo("tenants", "insert")[0].payload).toEqual({ name: "Nord" })
  })
})
