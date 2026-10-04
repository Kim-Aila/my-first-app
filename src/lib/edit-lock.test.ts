import { afterEach, describe, expect, it, vi } from "vitest"

import { acquireLock, lockedMessage, releaseLock } from "./edit-lock"

const target = { tenantId: "t1", resourceType: "article", resourceId: "a1" }

function mockFetch(response: { status: number; body?: unknown } | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe("acquireLock", () => {
  it("returns the expiry when the lock is granted", async () => {
    const fetchMock = mockFetch({ status: 200, body: { expiresAt: "2026-10-04T12:00:00Z" } })
    expect(await acquireLock(target)).toEqual({ ok: true, expiresAt: "2026-10-04T12:00:00Z" })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tenants/t1/locks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ resourceType: "article", resourceId: "a1" }),
      })
    )
  })

  it("reports the holder on a 409 and uses the server message", async () => {
    mockFetch({
      status: 409,
      body: { error: "Der Artikel wird gerade von anna bearbeitet.", lockedBy: { username: "anna", expiresAt: "x" } },
    })
    expect(await acquireLock(target)).toEqual({
      ok: false,
      kind: "locked",
      holder: { username: "anna", expiresAt: "x" },
      message: "Der Artikel wird gerade von anna bearbeitet.",
    })
  })

  it("falls back to a generic holder name and message when the 409 body is incomplete", async () => {
    mockFetch({ status: 409, body: { lockedBy: {} } })
    const result = await acquireLock(target)
    expect(result).toMatchObject({ ok: false, kind: "locked", holder: { username: "einem anderen Nutzer" } })
  })

  it("maps 403 and unknown errors to messages without leaking details", async () => {
    mockFetch({ status: 403, body: {} })
    expect(await acquireLock(target)).toEqual({ ok: false, kind: "error", message: "Dafür fehlt dir die Berechtigung." })
    mockFetch({ status: 500, body: null })
    const result = await acquireLock(target)
    expect(result).toMatchObject({ ok: false, kind: "error" })
  })

  it("reports a connection error when the request fails", async () => {
    mockFetch(new Error("network down"))
    expect(await acquireLock(target)).toMatchObject({ ok: false, kind: "error", message: expect.stringContaining("Verbindung") })
  })
})

describe("releaseLock", () => {
  it("sends a DELETE with the resource in the query string and optional keepalive", async () => {
    const fetchMock = mockFetch({ status: 204 })
    await releaseLock(target, { keepalive: true })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tenants/t1/locks?resourceType=article&resourceId=a1",
      { method: "DELETE", keepalive: true }
    )
  })

  it("never throws when the network fails (the lock expires on its own)", async () => {
    mockFetch(new Error("offline"))
    await expect(releaseLock(target)).resolves.toBeUndefined()
  })
})

describe("lockedMessage", () => {
  it("names the holder", () => {
    expect(lockedMessage({ username: "anna", expiresAt: null }, "Artikel")).toContain("anna")
  })
})
