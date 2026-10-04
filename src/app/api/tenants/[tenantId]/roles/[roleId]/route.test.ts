import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { PATCH, DELETE } = await import("./route")

const MASK = { module: "basis", maske: "benutzerverwaltung" }
const url = `http://localhost/api/tenants/${IDS.tenant}/roles/${IDS.role}`
const params = () => routeParams({ tenantId: IDS.tenant, roleId: IDS.role })

function existingRole(
  name = "Lager",
  permissions: { id: string; module: string; maske: string }[] = []
) {
  server.respond("roles:select", { data: { id: IDS.role, name, role_permissions: permissions } })
}

beforeEach(() => {
  server.reset()
})

describe("PATCH /api/tenants/:tenantId/roles/:roleId", () => {
  it("renames the role and adds new masks by diff (200)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    existingRole("Lager")

    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Lager Nord", masks: [MASK] }), params())
    expect(res.status).toBe(200)
    expect(server.callsTo("roles", "update")[0].payload).toEqual({ name: "Lager Nord" })
    expect(server.callsTo("role_permissions", "insert")[0].payload).toEqual([
      { role_id: IDS.role, ...MASK, access_level: "write" },
    ])
    expect(server.callsTo("role_permissions", "delete")).toHaveLength(0)
  })

  it("changes only the access level of a mask that stays (PROJ-3)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    const ARTIKEL = { module: "warenwirtschaft", maske: "artikelstamm" }
    server.respond("roles:select", {
      data: {
        id: IDS.role,
        name: "Lager",
        role_permissions: [{ id: "perm-1", ...ARTIKEL, access_level: "write" }],
      },
    })

    const res = await PATCH(
      jsonRequest(url, "PATCH", { name: "Lager", masks: [{ ...ARTIKEL, accessLevel: "read" }] }),
      params()
    )
    expect(res.status).toBe(200)
    expect(server.callsTo("role_permissions", "update")[0].payload).toEqual({ access_level: "read" })
    expect(server.callsTo("role_permissions", "insert")).toHaveLength(0)
    expect(server.callsTo("role_permissions", "delete")).toHaveLength(0)
  })

  it("does not touch a mask whose access level is unchanged", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    const ARTIKEL = { module: "warenwirtschaft", maske: "artikelstamm" }
    server.respond("roles:select", {
      data: {
        id: IDS.role,
        name: "Lager",
        role_permissions: [{ id: "perm-1", ...ARTIKEL, access_level: "read" }],
      },
    })

    const res = await PATCH(
      jsonRequest(url, "PATCH", { name: "Lager", masks: [{ ...ARTIKEL, accessLevel: "read" }] }),
      params()
    )
    expect(res.status).toBe(200)
    expect(server.callsTo("role_permissions", "update")).toHaveLength(0)
  })

  it("keeps an unchanged admin mask untouched when renaming its own admin role (BUG-3)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    existingRole("Administrator", [{ id: "perm-1", ...MASK }])

    const res = await PATCH(
      jsonRequest(url, "PATCH", { name: "Administratoren", masks: [MASK] }),
      params()
    )
    expect(res.status).toBe(200)
    expect(server.callsTo("role_permissions", "insert")).toHaveLength(0)
    expect(server.callsTo("role_permissions", "delete")).toHaveLength(0)
  })

  it("removes only masks that are no longer selected, by permission id", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    existingRole("Lager", [{ id: "perm-1", ...MASK }])

    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Lager", masks: [] }), params())
    expect(res.status).toBe(200)
    expect(server.callsTo("role_permissions", "insert")).toHaveLength(0)
    expect(server.callsTo("role_permissions", "delete")[0].filters).toEqual([
      { method: "eq", column: "role_id", value: IDS.role },
      { method: "in", column: "id", value: ["perm-1"] },
    ])
  })

  it("returns 500 without deleting masks if the insert fails", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    existingRole("Lager")
    server.respond("role_permissions:insert", { error: { message: "rls", code: "42501" } })
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Lager", masks: [MASK] }), params())
    expect(res.status).toBe(500)
    expect(server.callsTo("role_permissions", "delete")).toHaveLength(0)
  })

  it("does not issue a rename when the name is unchanged", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    existingRole("Lager")
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Lager", masks: [] }), params())
    expect(res.status).toBe(200)
    expect(server.callsTo("roles", "update")).toHaveLength(0)
  })

  it("returns 409 with field 'name' for a duplicate name", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    existingRole("Lager")
    server.respond("roles:update", { error: { message: "duplicate", code: "23505" } })
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "Verkauf", masks: [] }), params())
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("name")
    expect(server.callsTo("role_permissions", "delete")).toHaveLength(0)
  })

  it("returns 404 if the role does not belong to this tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:select", { data: null })
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "X", masks: [] }), params())
    expect(res.status).toBe(404)
  })

  it("returns 403 for a non-admin of this tenant", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(false)
    const res = await PATCH(jsonRequest(url, "PATCH", { name: "X", masks: [] }), params())
    expect(res.status).toBe(403)
  })

  it("returns 400 for an unknown mask", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await PATCH(
      jsonRequest(url, "PATCH", { name: "X", masks: [{ module: "x", maske: "y" }] }),
      params()
    )
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/tenants/:tenantId/roles/:roleId", () => {
  it("deletes the role scoped to the tenant (200)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    server.respond("roles:delete", { data: [{ id: IDS.role }] })
    const res = await DELETE(jsonRequest(url, "DELETE"), params())
    expect(res.status).toBe(200)
    expect(server.callsTo("roles", "delete")[0].filters).toEqual([
      { method: "eq", column: "id", value: IDS.role },
      { method: "eq", column: "tenant_id", value: IDS.tenant },
    ])
  })

  it("returns 403 for a non-admin of this tenant", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(false)
    const res = await DELETE(jsonRequest(url, "DELETE"), params())
    expect(res.status).toBe(403)
    expect(server.callsTo("roles", "delete")).toHaveLength(0)
  })

  it("returns 404 if the role was not found in this tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:delete", { data: [] })
    const res = await DELETE(jsonRequest(url, "DELETE"), params())
    expect(res.status).toBe(404)
  })
})
