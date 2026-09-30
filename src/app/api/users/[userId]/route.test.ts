import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest, routeParams } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))

const { PATCH, LAST_SUPER_ADMIN_MESSAGE, SELF_DEACTIVATION_MESSAGE } = await import("./route")

const patch = (body: unknown, userId: string = IDS.user) =>
  PATCH(
    jsonRequest(`http://localhost/api/users/${userId}`, "PATCH", body),
    routeParams({ userId })
  )

function target(isSuperAdmin: boolean) {
  server.respond("user_profiles:select", { data: { id: IDS.user, is_super_admin: isSuperAdmin } })
}

beforeEach(() => {
  server.reset()
})

describe("PATCH /api/users/:userId", () => {
  it("returns 403 for a non-super-admin (even a tenant admin)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: false })
    const res = await patch({ isActive: false })
    expect(res.status).toBe(403)
    expect(server.callsTo("user_profiles", "update")).toHaveLength(0)
  })

  it("returns 400 for an empty body", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await patch({})
    expect(res.status).toBe(400)
  })

  it("returns 400 for a non-boolean flag", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await patch({ isSuperAdmin: "yes" })
    expect(res.status).toBe(400)
  })

  it("blocks removing the flag from the last active super-admin (409, no field)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(true)
    server.respond("rpc:revoke_super_admin", { data: false })

    const res = await patch({ isSuperAdmin: false })
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data).toEqual({ error: LAST_SUPER_ADMIN_MESSAGE })
    expect(server.rpc).toHaveBeenCalledWith("revoke_super_admin", { target_id: IDS.user })
    expect(server.callsTo("user_profiles", "update")).toHaveLength(0)
  })

  it("blocks a super-admin removing their own flag if they are the last active one", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("user_profiles:select", { data: { id: IDS.caller, is_super_admin: true } })
    server.respond("rpc:revoke_super_admin", { data: false })
    const res = await patch({ isSuperAdmin: false }, IDS.caller)
    expect(res.status).toBe(409)
    expect(server.rpc).toHaveBeenCalledWith("revoke_super_admin", { target_id: IDS.caller })
  })

  it("does not use a separate count query (check + revoke are atomic in the RPC)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(true)
    server.respond("rpc:revoke_super_admin", { data: true })
    server.respond("user_profiles:select", {
      data: { id: IDS.user, is_super_admin: false, is_active: true },
    })
    await patch({ isSuperAdmin: false })
    // requireCaller + target lookup + final read — no `is_super_admin = true` count query.
    const selects = server.callsTo("user_profiles", "select")
    expect(selects.some((c) => c.filters.some((f) => f.column === "is_super_admin"))).toBe(false)
  })

  it("removes the flag via the RPC when another active super-admin exists (200)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(true)
    server.respond("rpc:revoke_super_admin", { data: true })
    server.respond("user_profiles:select", {
      data: { id: IDS.user, is_super_admin: false, is_active: true },
    })

    const res = await patch({ isSuperAdmin: false })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.isSuperAdmin).toBe(false)
    expect(server.rpc).toHaveBeenCalledTimes(1)
    // The flag is written by the RPC only — no second, non-atomic update of is_super_admin.
    expect(server.callsTo("user_profiles", "update")).toHaveLength(0)
  })

  it("revokes the flag via the RPC and applies isActive in the same request", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(true)
    server.respond("rpc:revoke_super_admin", { data: true })
    server.respond("user_profiles:update", {
      data: { id: IDS.user, is_super_admin: false, is_active: false },
    })
    const res = await patch({ isSuperAdmin: false, isActive: false })
    expect(res.status).toBe(200)
    expect(server.callsTo("user_profiles", "update")[0].payload).toEqual({ is_active: false })
  })

  it("does not call the RPC when the target is not a super-admin", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(false)
    server.respond("user_profiles:update", {
      data: { id: IDS.user, is_super_admin: false, is_active: true },
    })
    const res = await patch({ isSuperAdmin: false })
    expect(res.status).toBe(200)
    expect(server.rpc).not.toHaveBeenCalled()
  })

  it("returns 500 if the RPC fails", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(true)
    server.respond("rpc:revoke_super_admin", { error: { message: "boom" } })
    const res = await patch({ isSuperAdmin: false })
    expect(res.status).toBe(500)
    expect(server.callsTo("user_profiles", "update")).toHaveLength(0)
  })

  it("grants the super-admin flag (200)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(false)
    server.respond("user_profiles:update", {
      data: { id: IDS.user, is_super_admin: true, is_active: true },
    })
    const res = await patch({ isSuperAdmin: true })
    expect(res.status).toBe(200)
  })

  it("blocks self-deactivation (400)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    const res = await patch({ isActive: false }, IDS.caller)
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe(SELF_DEACTIVATION_MESSAGE)
    expect(server.callsTo("user_profiles", "update")).toHaveLength(0)
  })

  it("deactivates another user (200)", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    target(false)
    server.respond("user_profiles:update", {
      data: { id: IDS.user, is_super_admin: false, is_active: false },
    })
    const res = await patch({ isActive: false })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.isActive).toBe(false)
    expect(server.callsTo("user_profiles", "update")[0].payload).toEqual({ is_active: false })
  })

  it("returns 404 for an unknown user", async () => {
    server.loginAs({ id: IDS.caller, isSuperAdmin: true })
    server.respond("user_profiles:select", { data: null })
    const res = await patch({ isActive: true })
    expect(res.status).toBe(404)
  })
})
