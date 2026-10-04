"use client"

import * as React from "react"

import {
  LOCK_INACTIVITY_MS,
  acquireLock,
  releaseLock,
  type LockHolder,
  type LockTarget,
} from "@/lib/edit-lock"

export type EditLockStatus = "idle" | "acquiring" | "held" | "lost"
export type LockLostReason = "inactivity" | "taken"

const TICK_MS = 15_000
const WARN_BEFORE_MS = 2 * 60 * 1000
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "input", "focusin"] as const

export interface UseEditLockResult {
  status: EditLockStatus
  /** Wer die Sperre hält, wenn sie uns verwehrt wurde oder uns entzogen wurde. */
  holder: LockHolder | null
  /** Warum die Sperre verloren ging (nur bei status "lost"). */
  lostReason: LockLostReason | null
  /** Letzte 2 Minuten vor dem Inaktivitäts-Ablauf. */
  expiresSoon: boolean
  /** Fehlermeldung der letzten fehlgeschlagenen Anfrage (Sperre nicht möglich). */
  message: string | null
  /** Versucht die Sperre zu setzen. ok = Bearbeitung darf starten, sonst Meldung für den Nutzer. */
  acquire: () => Promise<{ ok: true } | { ok: false; message: string }>
  /** Gibt die Sperre frei (nach Speichern/Abbrechen) und setzt den Zustand zurück. */
  release: () => Promise<void>
}

/**
 * Hält eine Bearbeitungssperre, solange der Nutzer aktiv ist:
 * - verlängert sie im Hintergrund (höchstens alle ~15 s, nur nach Aktivität),
 * - gibt sie nach 15 Minuten ohne Aktivität selbst frei ("lost"/"inactivity"),
 * - erkennt, wenn ein anderer Nutzer sie übernommen hat ("lost"/"taken"),
 * - gibt sie beim Verlassen der Seite frei (Unmount, Tab schließen).
 */
export function useEditLock(target: LockTarget): UseEditLockResult {
  const { tenantId, resourceType, resourceId } = target
  const targetRef = React.useRef<LockTarget>({ tenantId, resourceType, resourceId })
  React.useEffect(() => {
    targetRef.current = { tenantId, resourceType, resourceId }
  }, [tenantId, resourceType, resourceId])

  const [status, setStatusState] = React.useState<EditLockStatus>("idle")
  const [holder, setHolder] = React.useState<LockHolder | null>(null)
  const [lostReason, setLostReason] = React.useState<LockLostReason | null>(null)
  const [expiresSoon, setExpiresSoon] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  const statusRef = React.useRef<EditLockStatus>("idle")
  const lastActivityRef = React.useRef(0)
  const lastRenewRef = React.useRef(0)

  const setStatus = React.useCallback((next: EditLockStatus) => {
    statusRef.current = next
    setStatusState(next)
  }, [])

  const acquire = React.useCallback(async () => {
    if (statusRef.current === "acquiring") return { ok: false as const, message: "Bitte einen Moment warten." }
    const lostBefore = statusRef.current === "lost"
    setStatus("acquiring")
    setMessage(null)
    const result = await acquireLock(targetRef.current)
    if (result.ok) {
      const now = Date.now()
      lastActivityRef.current = now
      lastRenewRef.current = now
      setHolder(null)
      setLostReason(null)
      setExpiresSoon(false)
      setStatus("held")
      return { ok: true as const }
    }
    setMessage(result.message)
    setHolder(result.kind === "locked" ? result.holder : null)
    // War die Sperre bereits verloren, bleibt der Zustand "lost" (Eingaben bleiben stehen).
    setStatus(lostBefore ? "lost" : "idle")
    return { ok: false as const, message: result.message }
  }, [setStatus])

  const release = React.useCallback(async () => {
    const wasHeld = statusRef.current === "held"
    setStatus("idle")
    setHolder(null)
    setLostReason(null)
    setExpiresSoon(false)
    setMessage(null)
    if (wasHeld) await releaseLock(targetRef.current)
  }, [setStatus])

  // Aktivität verfolgen + Verlängerung/Ablauf prüfen, solange die Sperre gehalten wird.
  React.useEffect(() => {
    if (status !== "held") return

    const markActivity = () => {
      lastActivityRef.current = Date.now()
    }
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, markActivity, { capture: true, passive: true })
    }

    let cancelled = false
    const tick = async () => {
      if (statusRef.current !== "held") return
      const now = Date.now()
      const idle = now - lastActivityRef.current

      if (idle >= LOCK_INACTIVITY_MS) {
        void releaseLock(targetRef.current)
        setLostReason("inactivity")
        setExpiresSoon(false)
        setStatus("lost")
        return
      }

      setExpiresSoon(LOCK_INACTIVITY_MS - idle <= WARN_BEFORE_MS)

      if (lastActivityRef.current > lastRenewRef.current) {
        const renewedFor = lastActivityRef.current
        const result = await acquireLock(targetRef.current)
        if (cancelled || statusRef.current !== "held") return
        if (result.ok) {
          lastRenewRef.current = renewedFor
        } else if (result.kind === "locked") {
          setHolder(result.holder)
          setLostReason("taken")
          setExpiresSoon(false)
          setStatus("lost")
        }
        // Netzwerkfehler: beim nächsten Tick erneut versuchen; serverseitiger Ablauf bleibt Netz.
      }
    }

    const interval = window.setInterval(() => void tick(), TICK_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, markActivity, { capture: true })
      }
    }
  }, [status, setStatus])

  // Beim Verlassen der Seite freigeben.
  React.useEffect(() => {
    const onPageHide = () => {
      if (statusRef.current === "held") {
        void releaseLock(targetRef.current, { keepalive: true })
      }
    }
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      if (statusRef.current === "held") {
        void releaseLock(targetRef.current, { keepalive: true })
        statusRef.current = "idle"
      }
    }
  }, [])

  return { status, holder, lostReason, expiresSoon, message, acquire, release }
}
