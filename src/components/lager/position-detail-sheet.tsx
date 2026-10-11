"use client"

import * as React from "react"

import { PositionActions } from "@/components/lager/position-actions"
import { LoadErrorAlert } from "@/components/state-messages"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet } from "@/lib/api-client"
import {
  formatDateTime,
  formatQuantity,
  stockStatusMeta,
  type StockPositionDetail,
} from "@/lib/stock"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted-foreground">–</span>}</dd>
    </div>
  )
}

/** Detailansicht einer LHM-Position (Daten, Status, Prüf-/Versandinfo, Import-Verlauf). */
export function PositionDetailSheet({
  tenantId,
  positionId,
  canWrite,
  onClose,
  onChanged,
}: {
  tenantId: string
  positionId: string | null
  canWrite: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = React.useState<StockPositionDetail | null>(null)
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle")

  React.useEffect(() => {
    if (!positionId) return
    const controller = new AbortController()
    setState("loading")
    setDetail(null)
    apiGet<StockPositionDetail>(
      `/api/tenants/${encodeURIComponent(tenantId)}/stock/positions/${encodeURIComponent(positionId)}`,
      controller.signal
    )
      .then((result) => {
        if (result.ok) {
          setDetail(result.data)
          setState("idle")
        } else setState("error")
      })
      .catch(() => {
        /* abgebrochen */
      })
    return () => controller.abort()
  }, [tenantId, positionId])

  const status = detail ? stockStatusMeta(detail.status) : null

  return (
    <Sheet open={positionId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-medium">LHM-Position</SheetTitle>
          <SheetDescription>
            {detail ? `SSCC ${detail.sscc} · ${detail.articleNumber}` : "Details werden geladen …"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6" aria-live="polite">
          {state === "loading" && (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {state === "error" && <LoadErrorAlert title="Position konnte nicht geladen werden" />}

          {detail && status && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                {detail.isMixedPallet && <Badge variant="outline">Mischpalette</Badge>}
                {!detail.articleId && <Badge variant="outline">Artikel nicht im Stamm</Badge>}
              </div>

              {canWrite && (
                <PositionActions
                  tenantId={tenantId}
                  position={detail}
                  size="default"
                  onDone={() => {
                    onChanged()
                    onClose()
                  }}
                />
              )}

              <dl className="grid grid-cols-2 gap-4">
                <Field label="SSCC">{detail.sscc}</Field>
                <Field label="Artikelnummer">{detail.articleNumber}</Field>
                <Field label="Bezeichnung">{detail.articleName}</Field>
                <Field label="Einheit (Datei)">{detail.unit}</Field>
                <Field label="Menge">{formatQuantity(detail.quantity)}</Field>
                <Field label="Freie Menge">{formatQuantity(detail.freeQuantity)}</Field>
                <Field label="Menge QS">{formatQuantity(detail.qsQuantity)}</Field>
                <Field label="Sperrmenge">{formatQuantity(detail.blockedQuantity)}</Field>
                <Field label="QS und Sperre gesamt">{formatQuantity(detail.qsAndBlockedQuantity)}</Field>
                <Field label="Logistikzentrum">{detail.logisticsCenter}</Field>
                <Field label="Bestandslagergruppe">{detail.stockGroup}</Field>
                <Field label="Erstmals gesehen">{formatDateTime(detail.firstSeenAt)}</Field>
                <Field label="Zuletzt im Abzug">{formatDateTime(detail.lastSeenAt)}</Field>
              </dl>

              {(detail.checkedAt || detail.shippedAt) && <Separator />}

              {detail.checkedAt && (
                <section aria-labelledby="pos-check-heading" className="space-y-2">
                  <h3 id="pos-check-heading" className="font-display text-base font-medium">
                    Prüfung
                  </h3>
                  <dl className="grid grid-cols-2 gap-4">
                    <Field label="Geprüft von">{detail.checkedByName}</Field>
                    <Field label="Zeitpunkt">{formatDateTime(detail.checkedAt)}</Field>
                    <div className="col-span-2">
                      <Field label="Bemerkung">{detail.checkRemark}</Field>
                    </div>
                  </dl>
                </section>
              )}

              {detail.shippedAt && (
                <section aria-labelledby="pos-ship-heading" className="space-y-2">
                  <h3 id="pos-ship-heading" className="font-display text-base font-medium">
                    Versandbuchung
                  </h3>
                  <dl className="grid grid-cols-2 gap-4">
                    <Field label="Gebucht von">{detail.shippedByName}</Field>
                    <Field label="Zeitpunkt">{formatDateTime(detail.shippedAt)}</Field>
                  </dl>
                </section>
              )}

              <Separator />

              <section aria-labelledby="pos-imports-heading" className="space-y-2">
                <h3 id="pos-imports-heading" className="font-display text-base font-medium">
                  Importe, in denen die Position vorkam
                </h3>
                {detail.imports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Importe verzeichnet.</p>
                ) : (
                  <ul className="divide-y rounded-lg border bg-card text-sm">
                    {detail.imports.map((entry) => (
                      <li key={entry.id} className="flex flex-wrap justify-between gap-x-3 px-3 py-2">
                        <span className="font-medium">{entry.fileName}</span>
                        <span className="text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                          {entry.userName ? ` · ${entry.userName}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
