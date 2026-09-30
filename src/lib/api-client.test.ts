import { afterEach, describe, expect, it, vi } from "vitest"

import { CONNECTION_ERROR_MESSAGE, apiRequest } from "./api-client"

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal("fetch", fn)
  return fn
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("apiRequest", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends JSON with content-type when a body is given", async () => {
    const fetchFn = mockFetch(async () => jsonResponse(201, { id: "1" }))
    const result = await apiRequest("/api/x", { method: "POST", body: { a: 1 } })
    expect(result).toEqual({ ok: true, data: { id: "1" } })
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/x")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })
    expect(init.body).toBe('{"a":1}')
  })

  it("omits body and headers without a body (DELETE)", async () => {
    const fetchFn = mockFetch(async () => jsonResponse(200, { success: true }))
    await apiRequest("/api/x", { method: "DELETE" })
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  })

  it("returns error + field from the server payload", async () => {
    mockFetch(async () => jsonResponse(409, { error: "E-Mail vergeben", field: "email" }))
    const result = await apiRequest("/api/x", { method: "POST", body: {} })
    expect(result).toEqual({ ok: false, status: 409, error: "E-Mail vergeben", field: "email" })
  })

  it("maps a network failure to status 0 + connection message", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch")
    })
    const result = await apiRequest("/api/x", { method: "POST", body: {} })
    expect(result).toEqual({ ok: false, status: 0, error: CONNECTION_ERROR_MESSAGE })
  })

  it("uses a permission fallback message for a 403 without JSON", async () => {
    mockFetch(async () => new Response("forbidden", { status: 403 }))
    const result = await apiRequest("/api/x", { method: "PATCH", body: {} })
    expect(result).toMatchObject({ ok: false, status: 403, error: "Dafür fehlt dir die Berechtigung." })
  })

  it("uses a generic fallback for other errors without a usable message", async () => {
    mockFetch(async () => jsonResponse(500, { error: "" }))
    const result = await apiRequest("/api/x", { method: "PATCH", body: {} })
    expect(result).toMatchObject({
      ok: false,
      status: 500,
      error: "Speichern fehlgeschlagen. Bitte versuche es erneut.",
      field: undefined,
    })
  })

  it("ignores a non-string field value", async () => {
    mockFetch(async () => jsonResponse(400, { error: "x", field: 42 }))
    const result = await apiRequest("/api/x", { method: "POST", body: {} })
    expect(result).toMatchObject({ ok: false, field: undefined })
  })

  it("accepts a successful response without JSON body", async () => {
    mockFetch(async () => new Response(null, { status: 204 }))
    const result = await apiRequest("/api/x", { method: "DELETE" })
    expect(result).toEqual({ ok: true, data: null })
  })
})
