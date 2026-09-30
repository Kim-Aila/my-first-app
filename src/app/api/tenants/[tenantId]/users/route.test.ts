import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()
const admin = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => admin.client }))

const { POST, USERNAME_TAKEN_MESSAGE } = await import("./route")

const NEW_USER_ID = "77777777-7777-4777-8777-777777777777"
const VALID = {
  username: "mia",
  email: "mia@example.com",
  password: "Sicher!123",
  roleIds: [IDS.role],
}

const post = (body: unknown, tenantId: string = IDS.tenant) =>
  POST(
    jsonRequest(`http://localhost/api/tenants/${tenantId}/users`, "POST", body),
    routeParams({ tenantId })
  )

/** Tenant admin (not super-admin) of IDS.tenant, tenant exists, role belongs to tenant. */
function arrangeTenantAdmin() {
  server.loginAs({ id: IDS.caller, isSuperAdmin: false })
  server.tenantAdminRoles(true)
  server.respond("tenants:select", { data: { id: IDS.tenant } })
  server.respond("roles:select", { data: [{ id: IDS.role }] })
}

function arrangeAuthUserCreated() {
  admin.auth.admin.createUser.mockImplementation(async () => ({
    data: { user: { id: NEW_USER_ID, email: "mia@example.com" } },
    error: null,
  }))
}

beforeEach(() => {
  server.reset()
  admin.reset()
})

describe("POST /api/tenants/:tenantId/users", () => {
  it("creates auth user, profile, tenant access and role assignments (201)", async () => {
    arrangeTenantAdmin()
    arrangeAuthUserCreated()

    const res = await post(VALID)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.id).toBe(NEW_USER_ID)
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: "mia@example.com",
      password: "Sicher!123",
      email_confirm: true,
    })
    expect(admin.callsTo("user_profiles", "insert")[0].payload).toEqual({
      id: NEW_USER_ID,
      username: "mia",
      email: "mia@example.com",
      is_super_admin: false,
      is_active: true,
    })
    expect(admin.callsTo("user_tenant_access", "insert")[0].payload).toEqual({
      user_id: NEW_USER_ID,
      tenant_id: IDS.tenant,
    })
    expect(admin.callsTo("user_roles", "insert")[0].payload).toEqual([
      { user_id: NEW_USER_ID, tenant_id: IDS.tenant, role_id: IDS.role },
    ])
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })

  it("skips the role insert when no roles are selected", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("tenants:select", { data: { id: IDS.tenant } })
    arrangeAuthUserCreated()

    const res = await post({ ...VALID, roleIds: [] })
    expect(res.status).toBe(201)
    expect(admin.callsTo("user_roles", "insert")).toHaveLength(0)
  })

  it("returns 403 for a user who is not admin of this tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: false })
    server.tenantAdminRoles(false)

    const res = await post(VALID)
    expect(res.status).toBe(403)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it("returns 400 with field 'password' if the password violates the policy", async () => {
    arrangeTenantAdmin()
    const res = await post({ ...VALID, password: "schwach" })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("password")
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it("returns 400 with field 'email' for an invalid email", async () => {
    arrangeTenantAdmin()
    const res = await post({ ...VALID, email: "keine-mail" })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("email")
  })

  it("returns 400 if a role does not belong to the tenant", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: false })
    server.tenantAdminRoles(true)
    server.respond("tenants:select", { data: { id: IDS.tenant } })
    server.respond("roles:select", { data: [] })

    const res = await post(VALID)
    expect(res.status).toBe(400)
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it("returns 409 with field 'username' if the username is taken", async () => {
    arrangeTenantAdmin()
    admin.respond("user_profiles:select", { data: { id: IDS.user } })

    const res = await post(VALID)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data).toEqual({ error: USERNAME_TAKEN_MESSAGE, field: "username" })
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it("returns 409 with field 'email' if the email is already registered", async () => {
    arrangeTenantAdmin()
    admin.auth.admin.createUser.mockImplementation(async () => ({
      data: { user: null },
      error: { message: "A user with this email address has already been registered", code: "email_exists", status: 422 },
    }))

    const res = await post(VALID)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("email")
  })

  it("returns 400 with field 'password' if GoTrue rejects the password as weak", async () => {
    arrangeTenantAdmin()
    admin.auth.admin.createUser.mockImplementation(async () => ({
      data: { user: null },
      error: { message: "Password should contain at least one character of each", code: "weak_password", status: 422 },
    }))
    const res = await post({ ...VALID, password: "Sicher§123" })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("password")
  })

  it("maps a case-insensitive username clash at profile insert to 409 and rolls back (BUG-11)", async () => {
    arrangeTenantAdmin()
    arrangeAuthUserCreated()
    // Exact-case pre-check finds nothing ("MIA" vs existing "mia") — the lower(username) index fires.
    admin.respond("user_profiles:insert", {
      error: { message: 'duplicate key value violates unique constraint "user_profiles_username_lower_key"', code: "23505" },
    })
    const res = await post({ ...VALID, username: "MIA" })
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data).toEqual({ error: USERNAME_TAKEN_MESSAGE, field: "username" })
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID)
  })

  it("rolls back the auth user on a username race at profile insert (409)", async () => {
    arrangeTenantAdmin()
    arrangeAuthUserCreated()
    admin.respond("user_profiles:insert", { error: { message: "duplicate", code: "23505" } })

    const res = await post(VALID)
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.field).toBe("username")
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID)
    expect(admin.callsTo("user_tenant_access", "insert")).toHaveLength(0)
  })

  it("rolls back everything if the role assignment fails (500)", async () => {
    arrangeTenantAdmin()
    arrangeAuthUserCreated()
    admin.respond("user_roles:insert", { error: { message: "boom" } })

    const res = await post(VALID)
    expect(res.status).toBe(500)
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID)
  })
})
