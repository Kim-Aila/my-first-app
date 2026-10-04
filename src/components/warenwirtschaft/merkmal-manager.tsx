"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Power } from "lucide-react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/state-messages"
import { StatusBadge } from "@/components/status-badge"
import { MerkmalFormDialog } from "@/components/warenwirtschaft/merkmal-form-dialog"
import { apiRequest } from "@/lib/api-client"
import {
  formatMerkmalValue,
  merkmalLabel,
  type MerkmalConfig,
  type MerkmalItem,
} from "@/lib/merkmale"

interface MerkmalManagerProps {
  config: MerkmalConfig
  tenantId: string
  tenantName: string
  items: MerkmalItem[]
  canWrite: boolean
}

/** Eine Pflege-Oberfläche für alle 9 Merkmal-Tabellen, gesteuert über `MerkmalConfig`. */
export function MerkmalManager({
  config,
  tenantId,
  tenantName,
  items,
  canWrite,
}: MerkmalManagerProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<MerkmalItem | null>(null)
  const [statusItem, setStatusItem] = React.useState<MerkmalItem | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [showInactive, setShowInactive] = React.useState(true)

  const visible = showInactive ? items : items.filter((i) => i.isActive)
  const inactiveCount = items.filter((i) => !i.isActive).length

  function openCreate() {
    setEditItem(null)
    setFormOpen(true)
  }

  function openEdit(item: MerkmalItem) {
    setEditItem(item)
    setFormOpen(true)
  }

  async function confirmStatusChange() {
    if (!statusItem) return
    const item = statusItem
    setStatusItem(null)
    setBusyId(item.id)
    try {
      const result = await apiRequest(
        `/api/tenants/${tenantId}/merkmale/${config.slug}/${item.id}`,
        { method: "PATCH", body: { isActive: !item.isActive } }
      )
      if (!result.ok) {
        toast.error(item.isActive ? "Deaktivieren fehlgeschlagen" : "Aktivieren fehlgeschlagen", {
          description: result.error,
        })
        return
      }
      toast.success(item.isActive ? "Eintrag deaktiviert" : "Eintrag aktiviert", {
        description: merkmalLabel(config, item),
      })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {items.length} Eintrag{items.length === 1 ? "" : "e"} in „{tenantName}“
          </p>
          {inactiveCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch
                id="merkmal-show-inactive"
                checked={showInactive}
                onCheckedChange={setShowInactive}
              />
              <Label htmlFor="merkmal-show-inactive" className="text-sm font-normal">
                Inaktive anzeigen ({inactiveCount})
              </Label>
            </div>
          )}
        </div>
        {canWrite && (
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Neuer Eintrag
          </Button>
        )}
      </div>

      {!canWrite && (
        <Alert>
          <AlertDescription>Du darfst diese Einträge ansehen, aber nicht ändern.</AlertDescription>
        </Alert>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={`Noch keine Einträge – ${config.plural}`}
          description={
            canWrite
              ? "Lege den ersten Eintrag an, damit er im Artikelformular auswählbar ist."
              : "In diesem Mandanten wurden noch keine Einträge angelegt."
          }
          action={
            canWrite ? (
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Neuer Eintrag
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <caption className="sr-only">
              {config.plural} im Mandanten {tenantName}
            </caption>
            <TableHeader>
              <TableRow>
                {config.fields.map((field) => (
                  <TableHead key={field.key} className="text-xs uppercase tracking-wider">
                    {field.label}
                  </TableHead>
                ))}
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                {canWrite && (
                  <TableHead className="text-right text-xs uppercase tracking-wider">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const busy = busyId === item.id
                const label = merkmalLabel(config, item)
                return (
                  <TableRow key={item.id} aria-busy={busy} className={item.isActive ? "" : "opacity-70"}>
                    {config.fields.map((field, index) => (
                      <TableCell key={field.key} className={index === 0 ? "font-medium" : ""}>
                        {formatMerkmalValue(field, item.values[field.key])}
                      </TableCell>
                    ))}
                    <TableCell>
                      <StatusBadge tone={item.isActive ? "positive" : "neutral"}>
                        {item.isActive ? "Aktiv" : "Inaktiv"}
                      </StatusBadge>
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            onClick={() => openEdit(item)}
                            aria-label={`${label} bearbeiten`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            onClick={() => setStatusItem(item)}
                            aria-label={`${label} ${item.isActive ? "deaktivieren" : "aktivieren"}`}
                            title={item.isActive ? "Deaktivieren" : "Aktivieren"}
                          >
                            <Power className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <MerkmalFormDialog
        config={config}
        tenantId={tenantId}
        tenantName={tenantName}
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editItem}
      />

      <AlertDialog open={statusItem !== null} onOpenChange={(open) => !open && setStatusItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              {`„${statusItem ? merkmalLabel(config, statusItem) : ""}“ ${statusItem?.isActive ? "deaktivieren" : "aktivieren"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusItem?.isActive
                ? "Der Eintrag erscheint nicht mehr in neuen Auswahllisten. Artikel, die ihn bereits verwenden, behalten ihn. Einträge werden nie gelöscht."
                : "Der Eintrag steht wieder in Auswahllisten zur Verfügung."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>
              {statusItem?.isActive ? "Deaktivieren" : "Aktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
