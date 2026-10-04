import { Clock, Lock } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { LockHolder } from "@/lib/edit-lock"
import type { UseEditLockResult } from "@/hooks/use-edit-lock"

interface EditLockBannerProps {
  lock: Pick<UseEditLockResult, "status" | "holder" | "lostReason" | "expiresSoon" | "message">
  /** Fremde Sperre, die schon beim Öffnen der Seite bestand. */
  initialHolder?: LockHolder | null
  /** Was gesperrt ist, z. B. "Artikel". */
  noun: string
  onReacquire?: () => void
  reacquiring?: boolean
}

/** Zeigt Sperr-Zustände an und nennt immer den Nutzer, der gerade bearbeitet. */
export function EditLockBanner({
  lock,
  initialHolder,
  noun,
  onReacquire,
  reacquiring,
}: EditLockBannerProps) {
  if (lock.status === "lost") {
    const taken = lock.lostReason === "taken"
    return (
      <Alert variant="destructive" role="alert">
        <Lock className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>
          {taken ? "Bearbeitungssperre verloren" : "Bearbeitungssperre abgelaufen"}
        </AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            {taken && lock.holder
              ? `${lock.holder.username} bearbeitet den ${noun} jetzt. `
              : `Nach 15 Minuten ohne Aktivität wurde die Sperre freigegeben. `}
            Deine Eingaben bleiben erhalten, können aber erst nach erneutem Sperren gespeichert
            werden.
            {lock.message ? ` ${lock.message}` : ""}
          </p>
          {onReacquire && (
            <Button size="sm" variant="outline" onClick={onReacquire} disabled={reacquiring}>
              {reacquiring ? "Wird gesperrt …" : "Erneut sperren"}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (lock.status === "held" && lock.expiresSoon) {
    return (
      <Alert role="status">
        <Clock className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Sperre läuft bald ab</AlertTitle>
        <AlertDescription>
          Ohne weitere Aktivität wird die Bearbeitungssperre in weniger als 2 Minuten freigegeben.
          Speichere deine Änderungen oder arbeite einfach weiter.
        </AlertDescription>
      </Alert>
    )
  }

  const blockedBy = lock.holder ?? initialHolder
  if (lock.status !== "held" && blockedBy) {
    return (
      <Alert role="status">
        <Lock className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Gesperrt – nur Lesezugriff</AlertTitle>
        <AlertDescription>
          Der {noun} wird gerade von <strong>{blockedBy.username}</strong> bearbeitet. Du kannst ihn
          ansehen, aber erst bearbeiten, wenn die Sperre freigegeben ist (spätestens nach 15 Minuten
          ohne Aktivität).
        </AlertDescription>
      </Alert>
    )
  }

  if (lock.status !== "held" && lock.message) {
    return (
      <Alert variant="destructive" role="alert">
        <Lock className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Bearbeiten nicht möglich</AlertTitle>
        <AlertDescription>{lock.message}</AlertDescription>
      </Alert>
    )
  }

  return null
}
