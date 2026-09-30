import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => {
    throw new Error("admin client must not be used here — RLS session client only")
  },
}))

const { PATCH, DELETE } = await import("./route")

const url = `http://localhost/api/tenants/${IDS.tenant}/users/${IDS.user}`
const params = () => routeParams({ tenantId: IDS.tenant, userId: IDS.user })

beforeEach(() => {
  server.reset()
})

describe("PATCH /api/tenants/:tenantId/users/:userId", () => {
  it("replaces the user's roles by diff: inserts only new, never touches kept roles (200)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    server.respond("roles:select", { data: [{ id: IDS.role }, { id: IDS.role2 }] })
    server.respond("user_tenant_access:select", { data: { id: "access-1" } })
    server.respond("user_roles:select", { data: [{ role_id: IDS.role }] })

    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [IDS.role, IDS.role2] }), params())
    expect(res.status).toBe(200)

    expect(server.callsTo("user_roles", "insert")[0].payload).toEqual([
      { user_id: IDS.user, tenant_id: IDS.tenant, role_id: IDS.role2 },
    ])
    // IDS.role stays in both sets → no delete at all (BUG-3: the caller's own admin role would
    // otherwise be removed before the insert and RLS would reject the insert).
    expect(server.callsTo("user_roles", "delete")).toHaveLength(0)
  })

  it("inserts added roles before deleting removed ones, scoped to the removed role ids", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:select", { data: [{ id: IDS.role2 }] })
    server.respond("user_tenant_access:select", { data: { id: "access-1" } })
    server.respond("user_roles:select", { data: [{ role_id: IDS.role }] })

    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [IDS.role2] }), params())
    expect(res.status).toBe(200)

    const writes = server.calls.filter((c) => c.table === "user_roles" && c.op !== "select")
    expect(writes.map((c) => c.op)).toEqual(["insert", "delete"])
    expect(writes[0].payload).toEqual([{ user_id: IDS.user, tenant_id: IDS.tenant, role_id: IDS.role2 }])
    expect(writes[1].filters).toEqual([
      { method: "eq", column: "user_id", value: IDS.user },
      { method: "eq", column: "tenant_id", value: IDS.tenant },
      { method: "in", column: "role_id", value: [IDS.role] },
    ])
  })

  it("does no writes when the role set is unchanged", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    server.respond("roles:select", { data: [{ id: IDS.role }] })
    server.respond("user_tenant_access:select", { data: { id: "access-1" } })
    server.respond("user_roles:select", { data: [{ role_id: IDS.role }] })

    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [IDS.role] }), params())
    expect(res.status).toBe(200)
    expect(server.callsTo("user_roles", "insert")).toHaveLength(0)
    expect(server.callsTo("user_roles", "delete")).toHaveLength(0)
  })

  it("allows removing all roles (empty list → delete of the previous roles only)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("user_tenant_access:select", { data: { id: "access-1" } })
    server.respond("user_roles:select", { data: [{ role_id: IDS.role }, { role_id: IDS.role2 }] })

    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [] }), params())
    expect(res.status).toBe(200)
    expect(server.callsTo("user_roles", "insert")).toHaveLength(0)
    const del = server.callsTo("user_roles", "delete")
    expect(del).toHaveLength(1)
    expect(del[0].filters).toContainEqual({ method: "in", column: "role_id", value: [IDS.role, IDS.role2] })
  })

  it("returns 500 without deleting anything if the insert fails", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:select", { data: [{ id: IDS.role2 }] })
    server.respond("user_tenant_access:select", { data: { id: "access-1" } })
    server.respond("user_roles:select", { data: [{ role_id: IDS.role }] })
    server.respond("user_roles:insert", { error: { message: "rls", code: "42501" } })

    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [IDS.role2] }), params())
    expect(res.status).toBe(500)
    expect(server.callsTo("user_roles", "delete")).toHaveLength(0)
  })

  it("rolls back the added roles if the delete fails", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:select", { data: [{ id: IDS.role2 }] })
    server.respond("user_tenant_access:select", { data: { id: "access-1" } })
    server.respond("user_roles:select", { data: [{ role_id: IDS.role }] })
    server.respond("user_roles:delete", { error: { message: "boom" } })

    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [IDS.role2] }), params())
    expect(res.status).toBe(500)
    const del = server.callsTo("user_roles", "delete")
    expect(del).toHaveLength(2)
    expect(del[1].filters).toContainEqual({ method: "in", column: "role_id", value: [IDS.role2] })
  })

  it("returns 403 for a non-admin of this tenant", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(false)
    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [] }), params())
    expect(res.status).toBe(403)
    expect(server.callsTo("user_roles", "delete")).toHaveLength(0)
  })

  it("returns 400 for a missing roleIds array", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await PATCH(jsonRequest(url, "PATCH", {}), params())
    expect(res.status).toBe(400)
  })

  it("returns 400 if a role belongs to another tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:select", { data: [] })
    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [IDS.role] }), params())
    expect(res.status).toBe(400)
    expect(server.callsTo("user_roles", "delete")).toHaveLength(0)
  })

  it("returns 404 if the user is not assigned to this tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("user_tenant_access:select", { data: null })
    const res = await PATCH(jsonRequest(url, "PATCH", { roleIds: [] }), params())
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/tenants/:tenantId/users/:userId", () => {
  it("removes only the tenant access row for this tenant (200)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    server.respond("user_tenant_access:delete", { data: [{ id: "access-1" }] })

    const res = await DELETE(jsonRequest(url, "DELETE"), params())
    expect(res.status).toBe(200)
    const del = server.callsTo("user_tenant_access", "delete")[0]
    expect(del.filters).toEqual([
      { method: "eq", column: "user_id", value: IDS.user },
      { method: "eq", column: "tenant_id", value: IDS.tenant },
    ])
    // user_roles cascade via FK — no explicit delete, no touch on user_profiles.
    expect(server.callsTo("user_roles", "delete")).toHaveLength(0)
    expect(server.callsTo("user_profiles", "update")).toHaveLength(0)
  })

  it("returns 403 for an admin of a different tenant", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(false)
    const res = await DELETE(jsonRequest(url, "DELETE"), params())
    expect(res.status).toBe(403)
    expect(server.callsTo("user_tenant_access", "delete")).toHaveLength(0)
  })

  it("returns 404 if nothing was removed", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("user_tenant_access:delete", { data: [] })
    const res = await DELETE(jsonRequest(url, "DELETE"), params())
    expect(res.status).toBe(404)
  })
})
