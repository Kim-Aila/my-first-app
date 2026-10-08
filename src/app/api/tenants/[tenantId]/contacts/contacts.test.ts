import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST } = await import("./route")
const { PATCH } = await import("./[contactId]/route")
const { PATCH: PATCH_STATUS } = await import("./[contactId]/status/route")

const CONTACT = "77777777-7777-4777-8777-777777777777"
const ADDRESS = "88888888-8888-4888-8888-888888888888"

const base = `http://localhost/api/tenants/${IDS.tenant}/contacts`
const post = (body: unknown) =>
  POST(jsonRequest(base, "POST", body), routeParams({ tenantId: IDS.tenant }))
const contactParams = () => routeParams({ tenantId: IDS.tenant, contactId: CONTACT })
const patch = (body: unknown) => PATCH(jsonRequest(`${base}/${CONTACT}`, "PATCH", body), contactParams())
const patchStatus = (body: unknown) =>
  PATCH_STATUS(jsonRequest(`${base}/${CONTACT}/status`, "PATCH", body), contactParams())

function asWriter() {
  server.loginAs({ id: IDS.caller })
  server.respond("rpc:mask_access_level", { data: "write" })
}

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants/:tenantId/contacts", () => {
  it("creates a contact for the address with only the last name (201)", async () => {
    asWriter()
    server.respond("contacts:insert", { data: { id: CONTACT } })
    const res = await post({ addressId: ADDRESS, lastName: " Meier ", firstName: "Anna", email: "a@b.de" })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: CONTACT })
    expect(server.rpc).toHaveBeenCalledWith("mask_access_level", {
      p_tenant_id: IDS.tenant,
      p_module: "warenwirtschaft",
      p_maske: "kontakte",
    })
    expect(server.callsTo("contacts", "insert")[0].payload).toEqual({
      tenant_id: IDS.tenant,
      address_id: ADDRESS,
      salutation: null,
      first_name: "Anna",
      last_name: "Meier",
      function_title: null,
      phone: null,
      mobile: null,
      email: "a@b.de",
      remark: null,
    })
  })

  it("never lets the client set the status or tenant", async () => {
    asWriter()
    server.respond("contacts:insert", { data: { id: CONTACT } })
    await post({ addressId: ADDRESS, lastName: "Meier", isActive: false, tenant_id: IDS.otherTenant })
    const payload = server.callsTo("contacts", "insert")[0].payload as Record<string, unknown>
    expect(payload.tenant_id).toBe(IDS.tenant)
    expect(payload).not.toHaveProperty("is_active")
  })

  it.each([
    [{ lastName: "" }, "lastName"],
    [{ lastName: "  " }, "lastName"],
    [{ lastName: "x".repeat(101) }, "lastName"],
    [{ email: "kaputt" }, "email"],
    [{ addressId: "kein-uuid" }, "addressId"],
    [{ salutation: "x".repeat(31) }, "salutation"],
  ])("returns 400 with the field for invalid input %j", async (override, field) => {
    asWriter()
    const res = await post({ addressId: ADDRESS, lastName: "Meier", ...override })
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe(field)
    expect(server.callsTo("contacts", "insert")).toHaveLength(0)
  })

  it("returns 401 without session and 403 for read access", async () => {
    expect((await post({ addressId: ADDRESS, lastName: "Meier" })).status).toBe(401)
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await post({ addressId: ADDRESS, lastName: "Meier" })).status).toBe(403)
  })

  it("rejects an address of another tenant (foreign key) and a deactivated address", async () => {
    asWriter()
    server.respond("contacts:insert", { error: { message: "violates foreign key", code: "23503" } })
    expect((await post({ addressId: ADDRESS, lastName: "Meier" })).status).toBe(400)
    server.respond("contacts:insert", {
      error: { message: "Zu einer deaktivierten Adresse können keine Kontakte angelegt werden.", code: "23514" },
    })
    asWriter()
    const res = await post({ addressId: ADDRESS, lastName: "Meier" })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("deaktivierten Adresse")
  })
})

describe("PATCH /api/tenants/:tenantId/contacts/:contactId", () => {
  it("saves the contact scoped to the tenant and releases the lock (200)", async () => {
    asWriter()
    server.respond("contacts:update", { data: { id: CONTACT } })
    const res = await patch({ lastName: "Schulz", addressId: PARENT_ID })
    expect(res.status).toBe(200)
    const call = server.callsTo("contacts", "update")[0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: CONTACT },
        { method: "eq", column: "tenant_id", value: IDS.tenant },
      ])
    )
    // Die Adresse eines Kontakts ist nicht änderbar.
    expect(call.payload).not.toHaveProperty("address_id")
    expect(server.rpc).toHaveBeenCalledWith("release_edit_lock", {
      p_tenant_id: IDS.tenant,
      p_resource_type: "contact",
      p_resource_id: CONTACT,
    })
  })

  it("returns 409 naming the user who edits the contact", async () => {
    asWriter()
    server.respond("contacts:update", {
      error: { message: "Der Kontakt wird gerade von anna bearbeitet.", code: "55P03" },
    })
    const res = await patch({ lastName: "Schulz" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("anna")
  })

  it("returns 404 for an unknown contact, 400 for a missing last name", async () => {
    asWriter()
    server.respond("contacts:update", { data: null })
    expect((await patch({ lastName: "Schulz" })).status).toBe(404)
    asWriter()
    expect((await patch({ lastName: "" })).status).toBe(400)
  })
})

describe("PATCH /api/tenants/:tenantId/contacts/:contactId/status", () => {
  it("deactivates and reactivates a contact with 'Lesen + Bearbeiten' only", async () => {
    asWriter()
    server.respond("contacts:update", { data: { id: CONTACT, is_active: false } })
    const res = await patchStatus({ isActive: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: CONTACT, isActive: false })
    expect(server.callsTo("contacts", "update")[0].payload).toEqual({ is_active: false })
    // Kein Zusatzrecht nötig: es wird nur die Maskenstufe geprüft.
    expect(server.rpc).not.toHaveBeenCalledWith("mask_can_toggle", expect.anything())
  })

  it("returns 409 for a foreign lock, 404 for unknown, 400 for bad body, 403 for read access", async () => {
    asWriter()
    server.respond("contacts:update", { error: { message: "gesperrt von anna", code: "55P03" } })
    expect((await patchStatus({ isActive: false })).status).toBe(409)
    asWriter()
    server.respond("contacts:update", { data: null })
    expect((await patchStatus({ isActive: true })).status).toBe(404)
    asWriter()
    expect((await patchStatus({})).status).toBe(400)
    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await patchStatus({ isActive: false })).status).toBe(403)
  })
})

const PARENT_ID = "99999999-9999-4999-8999-999999999999"
