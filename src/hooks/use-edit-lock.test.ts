import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const acquireLock = vi.fn()
const releaseLock = vi.fn(async (..._args: unknown[]) => {})

vi.mock("@/lib/edit-lock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/edit-lock")>("@/lib/edit-lock")
  return { ...actual, acquireLock: (...args: unknown[]) => acquireLock(...args), releaseLock: (...args: unknown[]) => releaseLock(...args) }
})

const { useEditLock } = await import("./use-edit-lock")

const target = { tenantId: "t1", resourceType: "article", resourceId: "a1" }
const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  acquireLock.mockReset()
  releaseLock.mockClear()
  acquireLock.mockResolvedValue({ ok: true, expiresAt: null })
})

afterEach(() => vi.useRealTimers())

async function held() {
  const hook = renderHook(() => useEditLock(target))
  await act(async () => {
    await hook.result.current.acquire()
  })
  return hook
}

describe("useEditLock", () => {
  it("starts idle and becomes 'held' after a successful acquire", async () => {
    const hook = renderHook(() => useEditLock(target))
    expect(hook.result.current.status).toBe("idle")
    let result: unknown
    await act(async () => {
      result = await hook.result.current.acquire()
    })
    expect(result).toEqual({ ok: true })
    expect(hook.result.current.status).toBe("held")
  })

  it("stays idle and exposes holder + message when somebody else holds the lock", async () => {
    acquireLock.mockResolvedValue({
      ok: false,
      kind: "locked",
      holder: { username: "anna", expiresAt: null },
      message: "Der Artikel wird gerade von anna bearbeitet.",
    })
    const hook = renderHook(() => useEditLock(target))
    let result: unknown
    await act(async () => {
      result = await hook.result.current.acquire()
    })
    expect(result).toEqual({ ok: false, message: "Der Artikel wird gerade von anna bearbeitet." })
    expect(hook.result.current.status).toBe("idle")
    expect(hook.result.current.holder?.username).toBe("anna")
    expect(hook.result.current.message).toContain("anna")
  })

  it("releases and reports 'lost' (inactivity) after 15 minutes without activity", async () => {
    const hook = await held()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14 * MINUTE)
    })
    expect(hook.result.current.status).toBe("held")
    expect(hook.result.current.expiresSoon).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * MINUTE)
    })
    expect(hook.result.current.status).toBe("lost")
    expect(hook.result.current.lostReason).toBe("inactivity")
    expect(releaseLock).toHaveBeenCalledWith(target)
  })

  it("renews the lock after activity and keeps it past 15 minutes while the user stays active", async () => {
    const hook = await held()
    acquireLock.mockClear()
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        document.dispatchEvent(new Event("keydown"))
        await vi.advanceTimersByTimeAsync(2 * MINUTE)
      })
    }
    expect(hook.result.current.status).toBe("held")
    expect(acquireLock).toHaveBeenCalled()
    expect(hook.result.current.expiresSoon).toBe(false)
  })

  it("does not call the server for renewals while the user is idle", async () => {
    await held()
    acquireLock.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * MINUTE)
    })
    expect(acquireLock).not.toHaveBeenCalled()
  })

  it("reports 'lost' (taken) when a renewal finds another holder", async () => {
    const hook = await held()
    acquireLock.mockResolvedValue({
      ok: false,
      kind: "locked",
      holder: { username: "bert", expiresAt: null },
      message: "x",
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000) // activity must be newer than the last renewal
      document.dispatchEvent(new Event("pointerdown"))
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(hook.result.current.status).toBe("lost")
    expect(hook.result.current.lostReason).toBe("taken")
    expect(hook.result.current.holder?.username).toBe("bert")
  })

  it("keeps trying (stays 'held') when a renewal fails because of the network", async () => {
    const hook = await held()
    acquireLock.mockResolvedValue({ ok: false, kind: "error", message: "offline" })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      document.dispatchEvent(new Event("keydown"))
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(hook.result.current.status).toBe("held")
  })

  it("release() frees the lock and resets the state", async () => {
    const hook = await held()
    await act(async () => {
      await hook.result.current.release()
    })
    expect(hook.result.current.status).toBe("idle")
    expect(releaseLock).toHaveBeenCalledWith(target)
  })

  it("release() does not call the server when no lock is held", async () => {
    const hook = renderHook(() => useEditLock(target))
    await act(async () => {
      await hook.result.current.release()
    })
    expect(releaseLock).not.toHaveBeenCalled()
  })

  it("releases the lock (keepalive) when the component unmounts while held", async () => {
    const hook = await held()
    hook.unmount()
    expect(releaseLock).toHaveBeenCalledWith(target, { keepalive: true })
  })

  it("keeps the 'lost' state and the holder when re-acquiring fails", async () => {
    const hook = await held()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16 * MINUTE)
    })
    expect(hook.result.current.status).toBe("lost")
    acquireLock.mockResolvedValue({
      ok: false,
      kind: "locked",
      holder: { username: "carla", expiresAt: null },
      message: "Der Artikel wird gerade von carla bearbeitet.",
    })
    await act(async () => {
      await hook.result.current.acquire()
    })
    expect(hook.result.current.status).toBe("lost")
    expect(hook.result.current.holder?.username).toBe("carla")

    acquireLock.mockResolvedValue({ ok: true, expiresAt: null })
    await act(async () => {
      await hook.result.current.acquire()
    })
    expect(hook.result.current.status).toBe("held")
    expect(hook.result.current.lostReason).toBeNull()
  })
})
