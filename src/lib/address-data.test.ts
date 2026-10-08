import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  loadAddressOptions,
  loadChildAddresses,
  loadForeignLock,
  sanitizeSearch,
} from "@/lib/address-data"

// Minimal chainable stand-in for the Supabase query builder: every filter returns the builder,
// awaiting it yields `result`.
function queryClient(result: { data: unknown; error: unknown }, options: { throws?: boolean } = {}) {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    options.throws ? reject(new Error("network")) : resolve(result)
  const from = vi.fn(() => builder)
  return { client: { from } as unknown as SupabaseClient, from, calls }
}

describe("sanitizeSearch", () => {
  it("keeps ordinary text, digits and dots", () => {
    expect(sanitizeSearch("Müller GmbH 4711.0001")).toBe("Müller GmbH 4711.0001")
  })

  it("replaces every character that could break a PostgREST or/ilike filter", () => {
    for (const bad of ["%", "_", "*", ",", "(", ")", '"', "\\"]) {
      expect(sanitizeSearch(`a${bad}b`)).toBe("a b")
    }
    expect(sanitizeSearch("x),(is_active.eq.true")).not.toMatch(/[(),]/)
  })

  it("collapses whitespace, trims and caps the length at 100 characters", () => {
    expect(sanitizeSearch("  a   b \n c  ")).toBe("a b c")
    expect(sanitizeSearch("a".repeat(500))).toHaveLength(100)
    expect(sanitizeSearch("   ")).toBe("")
    expect(sanitizeSearch("%%%")).toBe("")
  })
})

describe("loadAddressOptions", () => {
  const row = { id: "a1", address_number: "1.0001", name: "Eins", code: "EIN", is_active: true }

  it("does not query without ids and ignores empty values", async () => {
    const { client, from } = queryClient({ data: [], error: null })
    expect(await loadAddressOptions(client, "t1", [])).toEqual({})
    expect(await loadAddressOptions(client, "t1", [null, undefined, ""])).toEqual({})
    expect(from).not.toHaveBeenCalled()
  })

  it("asks once for the distinct ids of the tenant and keys the result by id", async () => {
    const { client, from, calls } = queryClient({ data: [row], error: null })
    const result = await loadAddressOptions(client, "t1", ["a1", "a1", null, "a1"])
    expect(from).toHaveBeenCalledTimes(1)
    expect(calls.find((c) => c.method === "in")?.args).toEqual(["id", ["a1"]])
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["tenant_id", "t1"])
    expect(result).toEqual({
      a1: { id: "a1", addressNumber: "1.0001", name: "Eins", code: "EIN", isActive: true },
    })
  })

  it("falls back to an empty mapping on a database error or an exception (best effort)", async () => {
    expect(await loadAddressOptions(queryClient({ data: null, error: { code: "42501" } }).client, "t1", ["a1"])).toEqual({})
    expect(await loadAddressOptions(queryClient({ data: null, error: null }, { throws: true }).client, "t1", ["a1"])).toEqual({})
  })
})

describe("loadChildAddresses", () => {
  it("returns the children sorted by address number and filtered by tenant and parent", async () => {
    const { client, calls } = queryClient({
      data: [{ id: "c1", address_number: "1.0002", name: "Kind", code: null, is_active: false }],
      error: null,
    })
    const result = await loadChildAddresses(client, "t1", "p1")
    expect(result.failed).toBe(false)
    expect(result.children).toEqual([
      { id: "c1", addressNumber: "1.0002", name: "Kind", code: null, isActive: false },
    ])
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([
      ["tenant_id", "t1"],
      ["parent_address_id", "p1"],
    ])
    expect(calls.find((c) => c.method === "order")?.args).toEqual(["address_number", { ascending: true }])
  })

  it("reports a failed load instead of showing an empty hierarchy", async () => {
    const result = await loadChildAddresses(queryClient({ data: null, error: { code: "XX" } }).client, "t1", "p1")
    expect(result).toEqual({ children: [], failed: true })
  })
})

describe("loadForeignLock", () => {
  function rpcClient(result: { data: unknown; error: unknown } | "throw") {
    const rpc = vi.fn(async () => {
      if (result === "throw") throw new Error("network")
      return result
    })
    return { client: { rpc } as unknown as SupabaseClient, rpc }
  }
  const lockRow = { out_user_id: "u2", out_username: "anna", out_expires_at: "2026-10-08T12:00:00Z" }

  it("returns the holder of a lock that belongs to ANOTHER user", async () => {
    const { client, rpc } = rpcClient({ data: [lockRow], error: null })
    expect(await loadForeignLock(client, "t1", "address", "a1", "u1")).toEqual({
      username: "anna",
      expiresAt: "2026-10-08T12:00:00Z",
    })
    expect(rpc).toHaveBeenCalledWith("get_edit_lock", {
      p_tenant_id: "t1",
      p_resource_type: "address",
      p_resource_id: "a1",
    })
  })

  it("returns null for the own lock, for no lock, and on errors", async () => {
    expect(await loadForeignLock(rpcClient({ data: [lockRow], error: null }).client, "t1", "address", "a1", "u2")).toBeNull()
    expect(await loadForeignLock(rpcClient({ data: [], error: null }).client, "t1", "address", "a1", "u1")).toBeNull()
    expect(await loadForeignLock(rpcClient({ data: null, error: null }).client, "t1", "address", "a1", "u1")).toBeNull()
    expect(await loadForeignLock(rpcClient({ data: [lockRow], error: { code: "42501" } }).client, "t1", "address", "a1", "u1")).toBeNull()
    expect(await loadForeignLock(rpcClient("throw").client, "t1", "address", "a1", "u1")).toBeNull()
  })
})
