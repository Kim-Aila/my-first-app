"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Pencil, Plus, Power } from "lucide-react"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ContactFormDialog } from "@/components/adressen/contact-form-dialog"
import { EmptyState, LoadErrorAlert } from "@/components/state-messages"
import { StatusBadge } from "@/components/status-badge"
import { apiGet, apiRequest } from "@/lib/api-client"
import {
  contactDisplayName,
  type AddressContacts,
  type Contact,
  type InheritedContact,
} from "@/lib/contacts"

interface AddressContactsTabProps {
  tenantId: string
  /** Fehlt bei einer noch nicht gespeicherten Adresse. */
  addressId: string | null
  addressText: string
  /** Schreibrecht auf die Maske "Kontakte". */
  canWrite: boolean
  /** Der Reiter gehört zur gespeicherten (nicht zur bearbeiteten) Adresse; Hinweis bei geänderter Zentrale. */
  parentChanged: boolean
}

const TH = "text-xs uppercase tracking-wider"

/**
 * Reiter "Kontakt": eigene Kontakte (bearbeitbar) und Kontakte aller übergeordneten Adressen
 * (nur lesbar, mit Herkunft). Kontakte sind eigene Datensätze mit eigener Sperre und eigenem
 * Speichern — unabhängig vom Bearbeitungsmodus der Adresse.
 */
export function AddressContactsTab({
  tenantId,
  addressId,
  addressText,
  canWrite,
  parentChanged,
}: AddressContactsTabProps) {
  const [data, setData] = React.useState<AddressContacts | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(addressId !== null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editContact, setEditContact] = React.useState<Contact | null>(null)
  const [statusContact, setStatusContact] = React.useState<Contact | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!addressId) return
    const controller = new AbortController()
    setLoading(true)
    apiGet<AddressContacts>(
      `/api/tenants/${tenantId}/addresses/${addressId}/contacts`,
      controller.signal
    )
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setData(result.data)
          setError(null)
        } else {
          setError(result.error)
        }
        setLoading(false)
      })
      .catch(() => undefined) // abgebrochen
    return () => controller.abort()
  }, [tenantId, addressId, reloadKey])

  const reload = React.useCallback(() => setReloadKey((key) => key + 1), [])

  async function confirmStatusChange() {
    if (!statusContact) return
    const contact = statusContact
    setStatusContact(null)
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
      reload()
    } finally {
      setBusyId(null)
    }
  }

  function openCreate() {
    setEditContact(null)
    setDialogOpen(true)
  }

  function openEdit(contact: Contact) {
    setEditContact(contact)
    setDialogOpen(true)
  }

  if (!addressId) {
    return (
      <EmptyState
        title="Kontakte nach dem ersten Speichern"
        description="Speichere die Adresse zuerst. Danach kannst du hier Ansprechpartner anlegen."
      />
    )
  }

  const own = data?.own ?? []
  const inherited = data?.inherited ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Eigene Kontakte dieser Adresse und – nur lesbar – die Kontakte aller übergeordneten
          Adressen.
        </p>
        {canWrite && (
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Kontakt anlegen
          </Button>
        )}
      </div>

      {parentChanged && (
        <Alert role="status">
          <AlertDescription>
            Du hast die übergeordnete Adresse geändert. Die angezeigten Kontakte übergeordneter
            Adressen wechseln erst nach dem Speichern.
          </AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Kontakte werden geladen …
        </div>
      ) : error ? (
        <LoadErrorAlert title="Kontakte konnten nicht geladen werden" description={error} />
      ) : own.length === 0 && inherited.length === 0 ? (
        <EmptyState
          title="Noch keine Kontakte"
          description={
            canWrite
              ? "Lege den ersten Ansprechpartner dieser Adresse an."
              : "Zu dieser Adresse sind keine Kontakte hinterlegt."
          }
          action={
            canWrite ? (
              <Button type="button" onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Kontakt anlegen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card" aria-busy={loading}>
          <Table>
            <caption className="sr-only">Kontakte der Adresse {addressText}</caption>
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
              {own.map((contact) => {
                const busy = busyId === contact.id
                const name = contactDisplayName(contact.values)
                return (
                  <TableRow key={contact.id} aria-busy={busy} className={contact.isActive ? "" : "opacity-70"}>
                    <ContactCells values={contact.values} name={name}>
                      <button
                        type="button"
                        onClick={() => openEdit(contact)}
                        className="text-left font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {name}
                      </button>
                    </ContactCells>
                    <TableCell className="text-sm text-muted-foreground">Diese Adresse</TableCell>
                    <TableCell>
                      <StatusBadge tone={contact.isActive ? "positive" : "neutral"}>
                        {contact.isActive ? "Aktiv" : "Inaktiv"}
                      </StatusBadge>
                    </TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            onClick={() => openEdit(contact)}
                            aria-label={`${name} bearbeiten`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            onClick={() => setStatusContact(contact)}
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
              {inherited.map((contact) => (
                <InheritedRow key={contact.id} contact={contact} tenantId={tenantId} showActions={canWrite} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ContactFormDialog
        tenantId={tenantId}
        addressId={addressId}
        addressText={addressText}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editContact}
        readOnly={!canWrite}
        onSaved={reload}
      />

      <AlertDialog
        open={statusContact !== null}
        onOpenChange={(open) => !open && setStatusContact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              {`Kontakt „${statusContact ? contactDisplayName(statusContact.values) : ""}“ ${statusContact?.isActive ? "deaktivieren" : "aktivieren"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusContact?.isActive
                ? "Der Kontakt bleibt gespeichert und wird als inaktiv gekennzeichnet. Gelöscht wird nichts."
                : "Der Kontakt ist wieder aktiv."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmStatusChange()}>
              {statusContact?.isActive ? "Deaktivieren" : "Aktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Name-Zelle (bereitgestellt als Kind) plus Funktion, Telefon/Mobil und E-Mail. */
function ContactCells({
  values,
  children,
}: {
  values: Contact["values"]
  name: string
  children: React.ReactNode
}) {
  const phones = [values.phone, values.mobile].filter(Boolean).join(" / ")
  return (
    <>
      <TableCell>{children}</TableCell>
      <TableCell className="hidden md:table-cell">
        {values.functionTitle || <span className="text-muted-foreground">–</span>}
      </TableCell>
      <TableCell className="hidden tabular-nums lg:table-cell">
        {phones || <span className="text-muted-foreground">–</span>}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {values.email || <span className="text-muted-foreground">–</span>}
      </TableCell>
    </>
  )
}

function InheritedRow({
  contact,
  tenantId,
  showActions,
}: {
  contact: InheritedContact
  tenantId: string
  showActions: boolean
}) {
  const name = contactDisplayName(contact.values)
  const levelText = contact.source.level === 1 ? "direkt übergeordnet" : `${contact.source.level}. Ebene darüber`
  return (
    <TableRow className={contact.isActive ? "bg-muted/30" : "bg-muted/30 opacity-70"}>
      <ContactCells values={contact.values} name={name}>
        <span className="font-medium">{name}</span>
      </ContactCells>
      <TableCell className="text-sm">
        <Link
          href={`/adressen/${contact.source.addressId}?mandant=${encodeURIComponent(tenantId)}`}
          target="_blank"
          rel="noopener"
          className="underline-offset-4 hover:text-primary hover:underline"
          title="Kontakt wird an dieser Adresse bearbeitet (neuer Tab)"
        >
          {contact.source.addressNumber} – {contact.source.addressName}
        </Link>
        <div className="text-xs text-muted-foreground">{levelText} · nur lesbar</div>
      </TableCell>
      <TableCell>
        <StatusBadge tone={contact.isActive ? "positive" : "neutral"}>
          {contact.isActive ? "Aktiv" : "Inaktiv"}
        </StatusBadge>
      </TableCell>
      {showActions && <TableCell />}
    </TableRow>
  )
}
