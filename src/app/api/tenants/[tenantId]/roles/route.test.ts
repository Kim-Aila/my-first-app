import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST } = await import("./route")

const MASK = { module: "basis", maske: "benutzerverwaltung" }
const post = (body: unknown) =>
  POST(
    jsonRequest(`http://localhost/api/tenants/${IDS.tenant}/roles`, "POST", body),
    routeParams({ tenantId: IDS.tenant })
  )

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants/:tenantId/roles", () => {
  it("creates the role and its mask permissions (201)", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(true)
    server.respond("roles:insert", { data: { id: IDS.role, name: "Administrator" } })

    const res = await post({ name: " Administrator ", masks: [MASK, MASK] })
    expect(res.status).toBe(201)
    expect(server.callsTo("roles", "insert")[0].payload).toEqual({
      tenant_id: IDS.tenant,
      name: "Administrator",
    })
    // Duplicates are collapsed.
    expect(server.callsTo("role_permissions", "insert")[0].payload).toEqual([
      { role_id: IDS.role, ...MASK, access_level: "write" },
    ])
  })

  it("stores the access level per mask; Benutzerverwaltung is always 'write' (PROJ-3)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:insert", { data: { id: IDS.role, name: "Lager" } })

    const res = await post({
      name: "Lager",
      masks: [
        { module: "warenwirtschaft", maske: "artikelstamm", accessLevel: "read" },
        { ...MASK, accessLevel: "read" },
      ],
    })
    expect(res.status).toBe(201)
    expect(server.callsTo("role_permissions", "insert")[0].payload).toEqual([
      { role_id: IDS.role, module: "warenwirtschaft", maske: "artikelstamm", access_level: "read" },
      { role_id: IDS.role, ...MASK, access_level: "write" },
    ])
  })

  it("returns 400 for an invalid access level", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await post({
      name: "Lager",
      masks: [{ module: "warenwirtschaft", maske: "artikelstamm", accessLevel: "admin" }],
    })
    expect(res.status).toBe(400)
    expect(server.callsTo("roles", "insert")).toHaveLength(0)
  })

  it("accepts the new Warenwirtschaft masks", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:insert", { data: { id: IDS.role, name: "Einkauf" } })
    const res = await post({
      name: "Einkauf",
      masks: [{ module: "warenwirtschaft", maske: "merkmal_saison", accessLevel: "write" }],
    })
    expect(res.status).toBe(201)
  })

  it("creates a role without masks", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:insert", { data: { id: IDS.role, name: "Lager" } })
    const res = await post({ name: "Lager", masks: [] })
    expect(res.status).toBe(201)
    expect(server.callsTo("role_permissions", "insert")).toHaveLength(0)
  })

  it("returns 400 for an unknown module/maske combination", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await post({ name: "Hacker", masks: [{ module: "basis", maske: "alles" }] })
    expect(res.status).toBe(400)
    expect(server.callsTo("roles", "insert")).toHaveLength(0)
  })

  it("returns 400 with field 'name' for an empty name", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await post({ name: "", masks: [] })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("name")
  })

  it("returns 403 for a non-admin of this tenant", async () => {
    server.loginAs({ id: IDS.caller })
    server.tenantAdminRoles(false)
    const res = await post({ name: "Lager", masks: [] })
    expect(res.status).toBe(403)
  })

  it("returns 409 with field 'name' for a duplicate role name in this tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:insert", { error: { message: "duplicate", code: "23505" } })
    const res = await post({ name: "Lager", masks: [] })
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("name")
  })

  it("deletes the role again if saving the permissions fails (500)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("roles:insert", { data: { id: IDS.role, name: "Lager" } })
    server.respond("role_permissions:insert", { error: { message: "boom" } })
    const res = await post({ name: "Lager", masks: [MASK] })
    expect(res.status).toBe(500)
    expect(server.callsTo("roles", "delete")[0].filters).toContainEqual({
      method: "eq",
      column: "id",
      value: IDS.role,
    })
  })
})
