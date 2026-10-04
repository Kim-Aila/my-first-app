// Client für die generische Bearbeitungssperre (PROJ-3, wiederverwendbar für künftige Module).
// Eine Sperre ist an Mandant + Datensatztyp + Datensatz gebunden und läuft nach 15 Minuten ohne
// Aktivität serverseitig ab. Der Server vergibt sie atomar und prüft sie beim Speichern.
//
// API-Vertrag (von /backend umzusetzen):
//   POST   /api/tenants/:tenantId/locks                       { resourceType, resourceId }
//          → 200 { expiresAt }   (neu vergeben oder eigene Sperre verlängert)
//          → 409 { error, lockedBy: { username, expiresAt } }  (fremde, noch gültige Sperre)
//   DELETE /api/tenants/:tenantId/locks?resourceType=…&resourceId=…
//          → 204 (gibt nur die eigene Sperre frei; idempotent)
import { CONNECTION_ERROR_MESSAGE } from "@/lib/api-client"

export const LOCK_INACTIVITY_MS = 15 * 60 * 1000

export interface LockHolder {
  username: string
  expiresAt: string | null
}

export type AcquireLockResult =
  | { ok: true; expiresAt: string | null }
  | { ok: false; kind: "locked"; holder: LockHolder; message: string }
  | { ok: false; kind: "error"; message: string }

export interface LockTarget {
  tenantId: string
  resourceType: string
  resourceId: string
}

export function lockedMessage(holder: LockHolder, noun = "Datensatz") {
  return `Der ${noun} wird gerade von ${holder.username} bearbeitet. Du hast nur Lesezugriff.`
}

export async function acquireLock(target: LockTarget): Promise<AcquireLockResult> {
  let res: Response
  try {
    res = await fetch(`/api/tenants/${target.tenantId}/locks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceType: target.resourceType, resourceId: target.resourceId }),
    })
  } catch {
    return { ok: false, kind: "error", message: CONNECTION_ERROR_MESSAGE }
  }

  let data: { expiresAt?: unknown; error?: unknown; lockedBy?: { username?: unknown; expiresAt?: unknown } } | null =
    null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (res.ok) {
    return { ok: true, expiresAt: typeof data?.expiresAt === "string" ? data.expiresAt : null }
  }

  if (res.status === 409 && data?.lockedBy) {
    const holder: LockHolder = {
      username: typeof data.lockedBy.username === "string" ? data.lockedBy.username : "einem anderen Nutzer",
      expiresAt: typeof data.lockedBy.expiresAt === "string" ? data.lockedBy.expiresAt : null,
    }
    return {
      ok: false,
      kind: "locked",
      holder,
      message: typeof data.error === "string" ? data.error : lockedMessage(holder),
    }
  }

  return {
    ok: false,
    kind: "error",
    message:
      typeof data?.error === "string"
        ? data.error
        : res.status === 403
          ? "Dafür fehlt dir die Berechtigung."
          : "Die Bearbeitungssperre konnte nicht gesetzt werden. Bitte versuche es erneut.",
  }
}

/** `keepalive` lässt die Anfrage auch beim Schließen des Tabs noch hinausgehen. */
export async function releaseLock(target: LockTarget, options: { keepalive?: boolean } = {}) {
  const params = new URLSearchParams({
    resourceType: target.resourceType,
    resourceId: target.resourceId,
  })
  try {
    await fetch(`/api/tenants/${target.tenantId}/locks?${params}`, {
      method: "DELETE",
      keepalive: options.keepalive,
    })
  } catch {
    // Best effort: Die Sperre läuft ohnehin nach 15 Minuten ab.
  }
}
