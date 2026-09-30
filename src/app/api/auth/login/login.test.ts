import { describe, it, expect, vi, beforeEach } from "vitest"

const updateSpy = vi.fn()
const signOutSpy = vi.fn()
let mockProfile: {
  id: string
  email: string
  failed_login_attempts: number
  locked_until: string | null
  is_active: boolean
} | null
let mockProfileError: { message: string } | null = null
let mockSignInError: { message: string } | null = null

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockProfile, error: mockProfileError }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updateSpy(payload)
          return { error: null }
        },
      }),
    }),
  }),
}))

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: mockSignInError }),
      signOut: async () => {
        signOutSpy()
        return { error: null }
      },
    },
  }),
}))

const { POST, MAX_LOGIN_ATTEMPTS, DEACTIVATED_MESSAGE } = await import("./route")

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  updateSpy.mockClear()
  signOutSpy.mockClear()
  mockProfile = {
    id: "user-1",
    email: "admin@example.com",
    failed_login_attempts: 0,
    locked_until: null,
    is_active: true,
  }
  mockProfileError = null
  mockSignInError = null
})

describe("POST /api/auth/login", () => {
  it("rejects a request with missing fields", async () => {
    const res = await POST(jsonRequest({ username: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 401 with remaining attempts for an unknown username", async () => {
    mockProfile = null
    const res = await POST(jsonRequest({ username: "ghost", password: "whatever" }))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS - 1)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("returns 423 immediately if the account is already locked", async () => {
    mockProfile!.locked_until = new Date(Date.now() + 60_000).toISOString()
    const res = await POST(jsonRequest({ username: "admin", password: "wrong" }))
    const data = await res.json()

    expect(res.status).toBe(423)
    expect(data.lockedUntil).toBe(mockProfile!.locked_until)
  })

  it("increments the failed attempt counter on wrong password", async () => {
    mockSignInError = { message: "Invalid login credentials" }
    const res = await POST(jsonRequest({ username: "admin", password: "wrong" }))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS - 1)
    expect(updateSpy).toHaveBeenCalledWith({ failed_login_attempts: 1 })
  })

  it("locks the account once the max attempt count is reached", async () => {
    mockSignInError = { message: "Invalid login credentials" }
    mockProfile!.failed_login_attempts = MAX_LOGIN_ATTEMPTS - 1
    const res = await POST(jsonRequest({ username: "admin", password: "wrong" }))
    const data = await res.json()

    expect(res.status).toBe(423)
    expect(data.lockedUntil).toBeDefined()
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ failed_login_attempts: MAX_LOGIN_ATTEMPTS })
    )
  })

  it("resets the failed attempt counter on successful login", async () => {
    mockProfile!.failed_login_attempts = 3
    const res = await POST(jsonRequest({ username: "admin", password: "correct" }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(updateSpy).toHaveBeenCalledWith({ failed_login_attempts: 0, locked_until: null })
  })

  it("rejects a deactivated user with correct credentials and signs the new session out", async () => {
    mockProfile!.is_active = false
    mockProfile!.failed_login_attempts = 2
    const res = await POST(jsonRequest({ username: "admin", password: "correct" }))
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe(DEACTIVATED_MESSAGE)
    expect(data.success).toBeUndefined()
    expect(signOutSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ failed_login_attempts: 0, locked_until: null })
  })

  it("treats a deactivated user with a wrong password like any wrong password (no status leak)", async () => {
    mockProfile!.is_active = false
    mockSignInError = { message: "Invalid login credentials" }
    const res = await POST(jsonRequest({ username: "admin", password: "wrong" }))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe("Benutzername oder Passwort ist falsch.")
    expect(data.error).not.toBe(DEACTIVATED_MESSAGE)
    expect(data.remainingAttempts).toBe(MAX_LOGIN_ATTEMPTS - 1)
    expect(signOutSpy).not.toHaveBeenCalled()
  })
})
