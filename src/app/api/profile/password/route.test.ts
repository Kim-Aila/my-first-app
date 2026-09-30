import { describe, it, expect, vi, beforeEach } from "vitest"

import { IDS, createSupabaseMock, jsonRequest } from "@/test/supabase-mock"

const server = createSupabaseMock()

vi.mock("@/lib/supabase-server", () => ({ createClient: async () => server.client }))
vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => {
    throw new Error("admin client must not be used for a self-service password change")
  },
}))

const { POST, PASSWORD_CHANGE_REJECTED_MESSAGE } = await import("./route")

const post = (body: unknown) =>
  POST(jsonRequest("http://localhost/api/profile/password", "POST", body))

beforeEach(() => {
  server.reset()
  server.loginAs({ id: IDS.caller, email: "mia@example.com" })
})

describe("POST /api/profile/password", () => {
  it("verifies the current password and updates it on the own session (200)", async () => {
    const res = await post({ currentPassword: "Alt!1234", newPassword: "Neu!5678x" })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toEqual({ success: true })
    expect(server.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "mia@example.com",
      password: "Alt!1234",
    })
    expect(server.auth.updateUser).toHaveBeenCalledWith({ password: "Neu!5678x" })
    expect(server.auth.signOut).not.toHaveBeenCalled()
  })

  it("returns 400 with field 'newPassword' if the new password violates the policy", async () => {
    const res = await post({ currentPassword: "Alt!1234", newPassword: "kurz" })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.field).toBe("newPassword")
    expect(server.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(server.auth.updateUser).not.toHaveBeenCalled()
  })

  it("returns 400 with field 'newPassword' if GoTrue rejects the password as weak", async () => {
    server.auth.updateUser.mockImplementation(async () => ({
      error: { message: "Password should contain at least one character of each", code: "weak_password" },
    }))
    const res = await post({ currentPassword: "Alt!1234", newPassword: "Neu§5678x" })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.field).toBe("newPassword")
  })

  it("returns 403 for a deactivated caller without touching the password", async () => {
    server.reset()
    server.auth.getUser.mockImplementation(async () => ({
      data: { user: { id: IDS.caller, email: "mia@example.com" } },
    }))
    server.respond("user_profiles:select", {
      data: { id: IDS.caller, email: "mia@example.com", is_super_admin: true, is_active: false },
    })
    const res = await post({ currentPassword: "Alt!1234", newPassword: "Neu!5678x" })
    expect(res.status).toBe(403)
    expect(server.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(server.auth.updateUser).not.toHaveBeenCalled()
  })

  it("returns 401 without a field if the current password is wrong, and saves nothing", async () => {
    server.auth.signInWithPassword.mockImplementation(async () => ({
      error: { message: "Invalid login credentials" },
    }))
    const res = await post({ currentPassword: "Falsch!1", newPassword: "Neu!5678x" })
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data).toEqual({ error: PASSWORD_CHANGE_REJECTED_MESSAGE })
    expect(server.auth.updateUser).not.toHaveBeenCalled()
  })

  it("returns 401 without a session", async () => {
    server.reset()
    const res = await post({ currentPassword: "Alt!1234", newPassword: "Neu!5678x" })
    expect(res.status).toBe(401)
  })
})
