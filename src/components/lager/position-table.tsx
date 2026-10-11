"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { PositionActions } from "@/components/lager/position-actions"
import { PositionDetailSheet } from "@/components/lager/position-detail-sheet"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, formatQuantity, stockStatusMeta, type StockPositionRow } from "@/lib/stock"

/**
 * Tabelle der LHM-Positionen. `review` = Prüfliste (mit Aktionsspalte für Nutzer mit Schreibrecht),
 * sonst die allgemeine LHM-Liste. Ein Klick auf die SSCC öffnet das Detail-Seitenpanel.
 */
export function PositionTable({
  tenantId,
  rows,
  canWrite,
  variant,
  caption,
}: {
  tenantId: string
  rows: StockPositionRow[]
  canWrite: boolean
  variant: "list" | "review"
  caption: string
}) {
  const router = useRouter()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const showActions = variant === "review" && canWrite

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wider">SSCC</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Artikel</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Menge</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wider md:table-cell">
                Zuletzt im Abzug
              </TableHead>
              {showActions && (
                <TableHead className="text-xs uppercase tracking-wider">Aktionen</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const status = stockStatusMeta(row.status)
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium tabular-nums">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 font-medium tabular-nums text-foreground hover:text-primary"
                      onClick={() => setOpenId(row.id)}
                      aria-label={`Details zu SSCC ${row.sscc}, Artikel ${row.articleNumber}`}
                    >
                      {row.sscc}
                    </Button>
                    {row.isMixedPallet && (
                      <Badge variant="outline" className="ml-2 font-normal">
                        Mischpalette
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums">{row.articleNumber}</span>
                    {row.articleName ? (
                      <div className="text-xs text-muted-foreground">{row.articleName}</div>
                    ) : (
                      <div className="text-xs text-[#9A3412]">Artikel nicht im Stamm</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(row.quantity)}
                    {row.unit ? <span className="ml-1 text-muted-foreground">{row.unit}</span> : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(row.lastSeenAt)}</TableCell>
                  {showActions && (
                    <TableCell>
                      <PositionActions
                        tenantId={tenantId}
                        position={row}
                        onDone={() => router.refresh()}
                      />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <PositionDetailSheet
        tenantId={tenantId}
        positionId={openId}
        canWrite={canWrite}
        onClose={() => setOpenId(null)}
        onChanged={() => router.refresh()}
      />
    </>
  )
}
