"use client"

import * as React from "react"
import { CheckCheck, Truck } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { apiRequest } from "@/lib/api-client"
import { POSITION_ACTION_CONFLICT_MESSAGE, type StockPositionRow } from "@/lib/stock"

const REMARK_MAX = 500

/**
 * Aktionen für eine fehlende, ungeprüfte Position: "Geprüft i.O." (Bemerkung optional) und
 * "Als versendet buchen". Der Server prüft, ob die Position noch im erwarteten Status ist (409 → Hinweis).
 */
export function PositionActions({
  tenantId,
  position,
  onDone,
  size = "sm",
}: {
  tenantId: string
  position: Pick<StockPositionRow, "id" | "sscc" | "articleNumber" | "status">
  /** Nach erfolgreicher Aktion oder Statuskonflikt (Ansicht neu laden). */
  onDone: () => void
  size?: "sm" | "default"
}) {
  const [checkOpen, setCheckOpen] = React.useState(false)
  const [shipOpen, setShipOpen] = React.useState(false)
  const [remark, setRemark] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (position.status !== "missing_unchecked") return null

  const base = `/api/tenants/${encodeURIComponent(tenantId)}/stock/positions/${encodeURIComponent(position.id)}`
  const label = `${position.sscc} · ${position.articleNumber}`

  async function submit(action: "check" | "ship") {
    setBusy(true)
    setError(null)
    const result = await apiRequest(`${base}/${action}`, {
      method: "POST",
      body: {
        expectedStatus: position.status,
        ...(action === "check" ? { remark: remark.trim() || null } : {}),
      },
    })
    setBusy(false)
    if (result.ok) {
      toast.success(action === "check" ? "Als „geprüft i.O.“ gespeichert" : "Als versendet gebucht", {
        description: label,
      })
      setCheckOpen(false)
      setShipOpen(false)
      setRemark("")
      onDone()
      return
    }
    if (result.status === 409) {
      setCheckOpen(false)
      setShipOpen(false)
      toast.error("Status hat sich geändert", {
        description: result.error || POSITION_ACTION_CONFLICT_MESSAGE,
      })
      onDone()
      return
    }
    setError(result.error)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size={size}
          variant="outline"
          onClick={() => {
            setError(null)
            setCheckOpen(true)
          }}
        >
          <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
          Geprüft i.O.
        </Button>
        <Button
          type="button"
          size={size}
          variant="outline"
          onClick={() => {
            setError(null)
            setShipOpen(true)
          }}
        >
          <Truck className="mr-1 h-4 w-4" aria-hidden="true" />
          Als versendet buchen
        </Button>
      </div>

      <Dialog open={checkOpen} onOpenChange={(open) => !busy && setCheckOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-medium">Als geprüft i.O. kennzeichnen</DialogTitle>
            <DialogDescription>
              {label} fehlt im Vollabzug. Mit der Bestätigung verschwindet die Position aus der
              Prüfliste; sie bleibt „Fehlt, geprüft i.O.“, bis sie im Abzug wieder auftaucht.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="check-remark">Bemerkung (optional)</Label>
            <Textarea
              id="check-remark"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              maxLength={REMARK_MAX}
              rows={3}
              className="bg-card"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              {remark.length} / {REMARK_MAX} Zeichen
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setCheckOpen(false)}>
              Abbrechen
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submit("check")}>
              {busy ? "Wird gespeichert …" : "Als geprüft speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={shipOpen} onOpenChange={(open) => !busy && setShipOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Als versendet buchen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {label} erhält den Status „Versendet“ mit deinem Namen und dem aktuellen Zeitpunkt.
              Taucht die Position später wieder im Vollabzug auf, wird sie nicht zurückgesetzt,
              sondern als Fehler gemeldet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                void submit("ship")
              }}
            >
              {busy ? "Bitte warten …" : "Versand buchen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
