"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Pencil, Power } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ContactFormDialog } from "@/components/adressen/contact-form-dialog"
import { StatusBadge } from "@/components/status-badge"
import { apiRequest } from "@/lib/api-client"
import { contactDisplayName, type Contact } from "@/lib/contacts"

export interface ContactRow {
  contact: Contact
  address: { id: string; addressNumber: string; name: string } | null
}

const TH = "text-xs uppercase tracking-wider"

/** Gesamtliste der Kontakte (adressübergreifend) mit Bearbeiten und (De)Aktivieren. */
export function ContactTable({
  tenantId,
  rows,
  canWrite,
}: {
  tenantId: string
  rows: ContactRow[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [editRow, setEditRow] = React.useState<ContactRow | null>(null)
  const [statusRow, setStatusRow] = React.useState<ContactRow | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function confirmStatusChange() {
    if (!statusRow) return
    const { contact } = statusRow
    setStatusRow(null)
    setBusyId(contact.id)
    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/contacts/${contact.id}/status`, {
        method: "PATCH",
        body: { isActive: !contact.isActive },
      })
      if (!result.ok) {
        toast.error(contact.isActive ? "Deaktivieren fehlgeschlagen" : "Aktivieren fehlgeschlagen", {
          description: result.error,
        })
        return
      }
      toast.success(contact.isActive ? "Kontakt deaktiviert" : "Kontakt aktiviert", {
        description: contactDisplayName(contact.values),
      })
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <caption className="sr-only">Kontakte aller Adressen</caption>
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>Name</TableHead>
              <TableHead className={`${TH} hidden md:table-cell`}>Funktion</TableHead>
              <TableHead className={`${TH} hidden lg:table-cell`}>Telefon / Mobil</TableHead>
              <TableHead className={`${TH} hidden md:table-cell`}>E-Mail</TableHead>
              <TableHead className={TH}>Adresse</TableHead>
              <TableHead className={TH}>Status</TableHead>
              {canWrite && (
                <TableHead className={`${TH} text-right`}>
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const { contact, address } = row
              const name = contactDisplayName(contact.values)
              const phones = [contact.values.phone, contact.values.mobile].filter(Boolean).join(" / ")
              const busy = busyId === contact.id
              return (
                <TableRow key={contact.id} aria-busy={busy} className={contact.isActive ? "" : "opacity-70"}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setEditRow(row)}
                      className="text-left font-medium underline-offset-4 hover:text-primary hover:underline"
                    >
                      {name}
                    </button>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {contact.values.functionTitle || <span className="text-muted-foreground">–</span>}
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">
                    {phones || <span className="text-muted-foreground">–</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {contact.values.email || <span className="text-muted-foreground">–</span>}
                  </TableCell>
                  <TableCell>
                    {address ? (
                      <Link
                        href={`/adressen/${address.id}?mandant=${encodeURIComponent(tenantId)}`}
                        className="underline-offset-4 hover:text-primary hover:underline"
                      >
                        {address.addressNumber} – {address.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={contact.isActive ? "positive" : "neutral"}>
                      {contact.isActive ? "Aktiv" : "Inaktiv"}
                    </StatusBadge>
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => setEditRow(row)}
                          aria-label={`${name} bearbeiten`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => setStatusRow(row)}
                          aria-label={`${name} ${contact.isActive ? "deaktivieren" : "aktivieren"}`}
                          title={contact.isActive ? "Deaktivieren" : "Aktivieren"}
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

      {editRow && (
        <ContactFormDialog
          tenantId={tenantId}
          addressId={editRow.contact.addressId}
          addressText={
            editRow.address ? `${editRow.address.addressNumber} – ${editRow.address.name}` : "einer Adresse"
          }
          open
          onOpenChange={(open) => !open && setEditRow(null)}
          contact={editRow.contact}
          readOnly={!canWrite}
          onSaved={() => router.refresh()}
        />
      )}

      <AlertDialog open={statusRow !== null} onOpenChange={(open) => !open && setStatusRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              {`Kontakt „${statusRow ? contactDisplayName(statusRow.contact.values) : ""}“ ${statusRow?.contact.isActive ? "deaktivieren" : "aktivieren"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusRow?.contact.isActive
                ? "Der Kontakt bleibt gespeichert und wird als inaktiv gekennzeichnet. Gelöscht wird nichts."
                : "Der Kontakt ist wieder aktiv."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmStatusChange()}>
              {statusRow?.contact.isActive ? "Deaktivieren" : "Aktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
