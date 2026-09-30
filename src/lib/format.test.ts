import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isCurrentlyLocked } from "./format"

describe("isCurrentlyLocked", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("is false for null / undefined / empty", () => {
    expect(isCurrentlyLocked(null)).toBe(false)
    expect(isCurrentlyLocked(undefined)).toBe(false)
    expect(isCurrentlyLocked("")).toBe(false)
  })

  it("is true for a lock ending in the future", () => {
    expect(isCurrentlyLocked("2026-09-29T12:15:00.000Z")).toBe(true)
  })

  it("is false for an expired lock", () => {
    expect(isCurrentlyLocked("2026-09-29T11:59:59.000Z")).toBe(false)
  })

  it("is false exactly at the expiry instant", () => {
    expect(isCurrentlyLocked("2026-09-29T12:00:00.000Z")).toBe(false)
  })

  it("handles Postgres timestamptz format with offset", () => {
    expect(isCurrentlyLocked("2026-09-29 14:10:00+02")).toBe(true)
  })

  it("is false for unparseable input instead of throwing", () => {
    expect(isCurrentlyLocked("not-a-date")).toBe(false)
  })
})
