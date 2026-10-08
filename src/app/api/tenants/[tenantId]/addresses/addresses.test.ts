import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { POST } = await import("./route")
const { PATCH } = await import("./[addressId]/route")
const { PATCH: PATCH_STATUS } = await import("./[addressId]/status/route")
const { GET: GET_CONTACTS } = await import("./[addressId]/contacts/route")
const { GET: GET_OPTIONS } = await import("./options/route")
const { GET: GET_SUFFIX } = await import("./next-suffix/route")
const { GET: GET_CODE } = await import("./code-check/route")

const ADDRESS = "77777777-7777-4777-8777-777777777777"
const PARENT = "88888888-8888-4888-8888-888888888888"
const COUNTRY = "99999999-9999-4999-8999-999999999999"

const valid = { addressBase: "4711", suffix: "0001", name: "Muster GmbH" }
const base = `http://localhost/api/tenants/${IDS.tenant}/addresses`
const tenantParams = () => routeParams({ tenantId: IDS.tenant })
const addressParams = () => routeParams({ tenantId: IDS.tenant, addressId: ADDRESS })

const post = (body: unknown) => POST(jsonRequest(base, "POST", body), tenantParams())
const patch = (body: unknown) =>
  PATCH(jsonRequest(`${base}/${ADDRESS}`, "PATCH", body), addressParams())
const patchStatus = (body: unknown) =>
  PATCH_STATUS(jsonRequest(`${base}/${ADDRESS}/status`, "PATCH", body), addressParams())
const get = (handler: typeof GET_OPTIONS, query: string) =>
  handler(jsonRequest(`${base}/x?${query}`, "GET"), tenantParams())

function asWriter() {
  server.loginAs({ id: IDS.caller })
  server.respond("rpc:mask_access_level", { data: "write" })
}

beforeEach(() => {
  server.reset()
})

describe("POST /api/tenants/:tenantId/addresses", () => {
  it("creates the address with only the required fields and maps snake_case columns (201)", async () => {
    asWriter()
    server.respond("addresses:insert", { data: { id: ADDRESS, address_number: "4711.0001" } })

    const res = await post({
      ...valid,
      name: " Muster GmbH ",
      code: " MUS ",
      roles: ["customer", "delivery_address", "customer"],
      countryId: COUNTRY,
      parentAddressId: PARENT,
      email: "info@muster.de",
      gln: "4012345000009",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: ADDRESS, addressNumber: "4711.0001" })
    expect(server.rpc).toHaveBeenCalledWith("mask_access_level", {
      p_tenant_id: IDS.tenant,
      p_module: "warenwirtschaft",
      p_maske: "adressen",
    })
    expect(server.callsTo("addresses", "insert")[0].payload).toMatchObject({
      tenant_id: IDS.tenant,
      address_base: "4711",
      address_suffix: "0001",
      name: "Muster GmbH",
      code: "MUS",
      roles: ["customer", "delivery_address"],
      country_id: COUNTRY,
      parent_address_id: PARENT,
      gln: "4012345000009",
      invoice_recipient_id: null,
      street: null,
    })
  })

  it("never lets the client set computed or status fields", async () => {
    asWriter()
    server.respond("addresses:insert", { data: { id: ADDRESS, address_number: "4711.0001" } })
    await post({ ...valid, addressNumber: "1.0001", searchText: "x", isActive: false, tenant_id: IDS.otherTenant })
    const payload = server.callsTo("addresses", "insert")[0].payload as Record<string, unknown>
    expect(payload.tenant_id).toBe(IDS.tenant)
    expect(payload).not.toHaveProperty("address_number")
    expect(payload).not.toHaveProperty("search_text")
    expect(payload).not.toHaveProperty("is_active")
  })

  it("returns 401 without a session", async () => {
    expect((await post(valid)).status).toBe(401)
  })

  it("returns 403 with read-only access", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    const res = await post(valid)
    expect(res.status).toBe(403)
    expect(server.callsTo("addresses", "insert")).toHaveLength(0)
  })

  it("returns 404 for an invalid tenant id", async () => {
    const res = await POST(jsonRequest("http://localhost/x", "POST", valid), routeParams({ tenantId: "nope" }))
    expect(res.status).toBe(404)
  })

  it.each([
    [{ addressBase: "" }, "addressBase"],
    [{ addressBase: "47a" }, "addressBase"],
    [{ addressBase: "12345678901" }, "addressBase"],
    [{ suffix: "001" }, "suffix"],
    [{ suffix: "00a1" }, "suffix"],
    [{ name: "  " }, "name"],
    [{ code: "x".repeat(11) }, "code"],
    [{ gln: "123" }, "gln"],
    [{ email: "kein-email" }, "email"],
    [{ roles: ["markeninhaber"] }, "roles"],
    [{ countryId: "kein-uuid" }, "countryId"],
    [{ parentAddressId: "kein-uuid" }, "parentAddressId"],
    [{ vatId: "x".repeat(16) }, "vatId"],
    [{ postalCode: "x".repeat(11) }, "postalCode"],
  ])("returns 400 with the field for invalid input %j", async (override, field) => {
    asWriter()
    const res = await post({ ...valid, ...override })
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe(field)
    expect(server.callsTo("addresses", "insert")).toHaveLength(0)
  })

  it("returns 409 on the Kennziffer for a duplicate Adressnummer", async () => {
    asWriter()
    server.respond("addresses:insert", { error: { message: "dup", code: "23505" } })
    const res = await post(valid)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data).toEqual({ error: "Adressnummer bereits vergeben", field: "suffix" })
  })

  it("passes a cycle error through with the field 'parentAddressId'", async () => {
    asWriter()
    server.respond("addresses:insert", {
      error: {
        message: "Eine Adresse kann nicht sich selbst übergeordnet sein.",
        code: "23514",
        details: "field:parentAddressId",
      } as never,
    })
    const res = await post({ ...valid, parentAddressId: PARENT })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "Eine Adresse kann nicht sich selbst übergeordnet sein.",
      field: "parentAddressId",
    })
  })

  it("reports an address from another tenant as invalid reference (foreign key)", async () => {
    asWriter()
    server.respond("addresses:insert", { error: { message: "violates foreign key", code: "23503" } })
    const res = await post({ ...valid, parentAddressId: PARENT })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("existiert nicht in diesem Mandanten")
  })
})

describe("PATCH /api/tenants/:tenantId/addresses/:addressId", () => {
  it("saves the record scoped to the tenant and releases the edit lock (200)", async () => {
    asWriter()
    server.respond("addresses:update", { data: { id: ADDRESS, address_number: "4711.0002" } })
    const res = await patch({ ...valid, suffix: "0002", isActive: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ADDRESS, addressNumber: "4711.0002" })
    const call = server.callsTo("addresses", "update")[0]
    expect(call.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: ADDRESS },
        { method: "eq", column: "tenant_id", value: IDS.tenant },
      ])
    )
    // Der Status ist nicht über diese Route änderbar.
    expect(call.payload).not.toHaveProperty("is_active")
    expect(server.rpc).toHaveBeenCalledWith("release_edit_lock", {
      p_tenant_id: IDS.tenant,
      p_resource_type: "address",
      p_resource_id: ADDRESS,
    })
  })

  it("returns 409 with the lock holder's name when someone else edits the address", async () => {
    asWriter()
    server.respond("addresses:update", {
      error: { message: "Die Adresse wird gerade von anna bearbeitet. Bitte versuche es später erneut.", code: "55P03" },
    })
    const res = await patch(valid)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("anna")
  })

  it("returns 409 when the own lock has expired", async () => {
    asWriter()
    server.respond("addresses:update", {
      error: { message: "Deine Bearbeitungssperre ist abgelaufen.", code: "55P03" },
    })
    expect((await patch(valid)).status).toBe(409)
  })

  it("returns 404 when the address does not exist in this tenant", async () => {
    asWriter()
    server.respond("addresses:update", { data: null })
    expect((await patch(valid)).status).toBe(404)
    expect(server.rpc).not.toHaveBeenCalledWith("release_edit_lock", expect.anything())
  })

  it("returns 400 for invalid input and 403 for read access", async () => {
    asWriter()
    expect((await patch({ ...valid, suffix: "1" })).status).toBe(400)
    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await patch(valid)).status).toBe(403)
  })
})

describe("PATCH /api/tenants/:tenantId/addresses/:addressId/status", () => {
  it("calls the atomic status function and reports what changed", async () => {
    asWriter()
    server.respond("rpc:set_address_status", { data: [{ out_addresses: 3, out_contacts: 5 }] })
    const res = await patchStatus({ isActive: false, includeChildren: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: ADDRESS,
      isActive: false,
      changedAddresses: 3,
      changedContacts: 5,
    })
    expect(server.rpc).toHaveBeenCalledWith("set_address_status", {
      p_tenant_id: IDS.tenant,
      p_address_id: ADDRESS,
      p_is_active: false,
      p_include_children: true,
    })
  })

  it("defaults includeChildren to false", async () => {
    asWriter()
    server.respond("rpc:set_address_status", { data: [{ out_addresses: 1, out_contacts: 0 }] })
    await patchStatus({ isActive: true })
    expect(server.rpc).toHaveBeenCalledWith(
      "set_address_status",
      expect.objectContaining({ p_include_children: false })
    )
  })

  it("returns 403 when the additional right is missing (database denies)", async () => {
    asWriter()
    server.respond("rpc:set_address_status", {
      error: { message: "Dafür fehlt dir die Berechtigung.", code: "42501" },
    })
    expect((await patchStatus({ isActive: false })).status).toBe(403)
  })

  it("returns 409 naming the user who is editing the address", async () => {
    asWriter()
    server.respond("rpc:set_address_status", {
      error: { message: "Die Adresse wird gerade von anna bearbeitet.", code: "55P03" },
    })
    const res = await patchStatus({ isActive: false })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("anna")
  })

  it("returns 404 for an unknown address", async () => {
    asWriter()
    server.respond("rpc:set_address_status", { error: { message: "Adresse nicht gefunden.", code: "P0002" } })
    expect((await patchStatus({ isActive: false })).status).toBe(404)
  })

  it("returns 400 without a valid status and never deletes", async () => {
    asWriter()
    expect((await patchStatus({})).status).toBe(400)
    asWriter()
    expect((await patchStatus({ isActive: "nein" })).status).toBe(400)
    expect(server.callsTo("addresses", "delete")).toHaveLength(0)
  })

  it("returns 403 without write access to the mask (before touching the database function)", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await patchStatus({ isActive: false })).status).toBe(403)
    expect(server.rpc).not.toHaveBeenCalledWith("set_address_status", expect.anything())
  })
})

describe("GET /api/tenants/:tenantId/addresses/:addressId/contacts", () => {
  const row = (level: number, id: string, lastName: string, addressId = ADDRESS) => ({
    out_level: level,
    out_id: id,
    out_address_id: addressId,
    out_address_number: level === 0 ? "4711.0001" : "4711.0000",
    out_address_name: level === 0 ? "Filiale" : "Zentrale",
    out_salutation: null,
    out_first_name: "Anna",
    out_last_name: lastName,
    out_function_title: null,
    out_phone: "123",
    out_mobile: null,
    out_email: null,
    out_remark: null,
    out_is_active: true,
  })

  it("splits own contacts and those of parent addresses with their origin", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" }, { data: "read" })
    server.respond("rpc:address_contacts", {
      data: [row(0, "c1", "Meier"), row(1, "c2", "Schulz", PARENT)],
    })
    const res = await GET_CONTACTS(jsonRequest(`${base}/${ADDRESS}/contacts`, "GET"), addressParams())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.own).toHaveLength(1)
    expect(data.own[0]).toMatchObject({ id: "c1", addressId: ADDRESS, isActive: true })
    expect(data.own[0].values).toMatchObject({ lastName: "Meier", firstName: "Anna", phone: "123", email: "" })
    expect(data.inherited).toHaveLength(1)
    expect(data.inherited[0].source).toEqual({
      addressId: PARENT,
      addressNumber: "4711.0000",
      addressName: "Zentrale",
      level: 1,
    })
    expect(server.rpc).toHaveBeenCalledWith("address_contacts", {
      p_tenant_id: IDS.tenant,
      p_address_id: ADDRESS,
    })
  })

  it("needs read access to both Kontakte and Adressen", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" }, { data: null })
    const res = await GET_CONTACTS(jsonRequest(`${base}/${ADDRESS}/contacts`, "GET"), addressParams())
    expect(res.status).toBe(403)
    expect(server.rpc).not.toHaveBeenCalledWith("address_contacts", expect.anything())
  })

  it("returns 403 without any Kontakte right", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: null })
    const res = await GET_CONTACTS(jsonRequest(`${base}/${ADDRESS}/contacts`, "GET"), addressParams())
    expect(res.status).toBe(403)
  })
})

describe("GET addresses/options", () => {
  const optionRow = { out_id: ADDRESS, out_address_number: "4711.0001", out_name: "Muster", out_code: "MUS", out_is_active: true }

  it("returns matching options mapped to the API shape", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    server.respond("rpc:address_options", { data: [optionRow] })
    const res = await get(GET_OPTIONS, `q=mus&requireCode=true&excludeSubtreeOf=${PARENT}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [{ id: ADDRESS, addressNumber: "4711.0001", name: "Muster", code: "MUS", isActive: true }],
    })
    expect(server.rpc).toHaveBeenCalledWith("address_options", {
      p_tenant_id: IDS.tenant,
      p_q: "mus",
      p_require_code: true,
      p_exclude_subtree_of: PARENT,
      p_limit: 25,
    })
  })

  it("is allowed with the Artikelstamm right alone (Markeninhaber on the article)", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: null }, { data: "read" })
    server.respond("rpc:address_options", { data: [] })
    const res = await get(GET_OPTIONS, "requireCode=true")
    expect(res.status).toBe(200)
    expect(server.rpc).toHaveBeenCalledWith("mask_access_level", expect.objectContaining({ p_maske: "artikelstamm" }))
  })

  it("returns 403 with neither right and 400 for a broken filter", async () => {
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: null }, { data: null })
    expect((await get(GET_OPTIONS, "")).status).toBe(403)
    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await get(GET_OPTIONS, "excludeSubtreeOf=kein-uuid")).status).toBe(400)
  })

  it("returns 401 without a session", async () => {
    expect((await get(GET_OPTIONS, "")).status).toBe(401)
  })
})

describe("GET addresses/next-suffix", () => {
  it("suggests the next free Kennziffer", async () => {
    asWriter()
    server.respond("rpc:next_address_suffix", { data: [{ out_exists: true, out_suffix: "0003" }] })
    const res = await get(GET_SUFFIX, "base=4711")
    expect(await res.json()).toEqual({ exists: true, suffix: "0003" })
    expect(server.rpc).toHaveBeenCalledWith("next_address_suffix", { p_tenant_id: IDS.tenant, p_base: "4711" })
  })

  it("says the base is new when it does not exist yet", async () => {
    asWriter()
    server.respond("rpc:next_address_suffix", { data: [{ out_exists: false, out_suffix: null }] })
    expect(await (await get(GET_SUFFIX, "base=99")).json()).toEqual({ exists: false, suffix: null })
  })

  it("rejects an invalid base and read-only users", async () => {
    asWriter()
    expect((await get(GET_SUFFIX, "base=abc")).status).toBe(400)
    asWriter()
    expect((await get(GET_SUFFIX, "")).status).toBe(400)
    server.reset()
    server.loginAs({ id: IDS.caller })
    server.respond("rpc:mask_access_level", { data: "read" })
    expect((await get(GET_SUFFIX, "base=4711")).status).toBe(403)
  })
})

describe("GET addresses/code-check", () => {
  it("lists addresses that already use the Kürzel, including inactive ones", async () => {
    asWriter()
    server.respond("rpc:address_code_matches", {
      data: [{ out_id: PARENT, out_address_number: "1.0001", out_name: "Alt", out_code: "MUS", out_is_active: false }],
    })
    const res = await get(GET_CODE, `code=mus&excludeId=${ADDRESS}`)
    expect(await res.json()).toEqual({
      items: [{ id: PARENT, addressNumber: "1.0001", name: "Alt", code: "MUS", isActive: false }],
    })
    expect(server.rpc).toHaveBeenCalledWith("address_code_matches", {
      p_tenant_id: IDS.tenant,
      p_code: "mus",
      p_exclude_id: ADDRESS,
    })
  })

  it("requires a Kürzel and a valid exclude id", async () => {
    asWriter()
    expect((await get(GET_CODE, "")).status).toBe(400)
    asWriter()
    expect((await get(GET_CODE, "code=MUS&excludeId=x")).status).toBe(400)
  })
})
