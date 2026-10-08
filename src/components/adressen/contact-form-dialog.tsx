"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Form } from "@/components/ui/form"
import { EditLockBanner } from "@/components/edit-lock/edit-lock-banner"
import { useUnsavedChangesEntry } from "@/components/unsaved-changes-provider"
import { TextAreaField, TextField } from "@/components/warenwirtschaft/form-fields"
import { useEditLock } from "@/hooks/use-edit-lock"
import { apiRequest } from "@/lib/api-client"
import { CONTACT_LOCK_RESOURCE } from "@/lib/addresses"
import {
  EMPTY_CONTACT_VALUES,
  contactFormSchema,
  toContactPayload,
  type Contact,
  type ContactFormValues,
} from "@/lib/contacts"

interface ContactFormDialogProps {
  tenantId: string
  /** Adresse, zu der der Kontakt gehört (beim Anlegen vorbelegt). */
  addressId: string
  /** Kontext-Text im Dialog, z. B. "4711.0001 – Muster GmbH". */
  addressText: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ohne `contact` wird ein neuer Kontakt angelegt. */
  contact: Contact | null
  /** Nur ansehen (Leserecht): keine Sperre, keine Eingabe. */
  readOnly?: boolean
  /** Nach erfolgreichem Speichern (Liste neu laden). */
  onSaved: () => void
}

export function ContactFormDialog(props: ContactFormDialogProps) {
  const { open, onOpenChange, contact, readOnly, addressText } = props
  const [busy, setBusy] = React.useState(false)
  // Das Formular meldet hier seine Abbrechen-Logik an (Rückfrage bei ungespeicherten Änderungen),
  // damit auch Esc, Klick außerhalb und das X dieselbe Rückfrage auslösen.
  const closeRequest = React.useRef<(() => void) | null>(null)

  function handleOpenChange(next: boolean) {
    if (busy) return
    if (!next && closeRequest.current) {
      closeRequest.current()
      return
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">
            {readOnly ? "Kontakt" : contact ? "Kontakt bearbeiten" : "Kontakt anlegen"}
          </DialogTitle>
          <DialogDescription>Gehört zu {addressText}</DialogDescription>
        </DialogHeader>
        {/* DialogContent wird beim Schließen ausgehängt → Formular und Sperre starten frisch. */}
        <ContactForm
          key={contact?.id ?? "new"}
          {...props}
          busy={busy}
          setBusy={setBusy}
          closeRequest={closeRequest}
          onClose={() => {
            closeRequest.current = null
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ContactForm({
  tenantId,
  addressId,
  contact,
  readOnly,
  onSaved,
  busy,
  setBusy,
  closeRequest,
  onClose,
}: ContactFormDialogProps & {
  busy: boolean
  setBusy: (busy: boolean) => void
  closeRequest: React.MutableRefObject<(() => void) | null>
  onClose: () => void
}) {
  const router = useRouter()
  const isNew = contact === null
  const [formError, setFormError] = React.useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = React.useState(false)

  const lock = useEditLock({
    tenantId,
    resourceType: CONTACT_LOCK_RESOURCE,
    resourceId: contact?.id ?? "new",
  })

  const initialValues = contact?.values ?? EMPTY_CONTACT_VALUES
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: initialValues,
  })
  const { isDirty } = form.formState

  // Bestehende Kontakte werden beim Öffnen gesperrt; gelingt das nicht (fremde Sperre), bleibt der
  // Dialog im Lesemodus und das Banner nennt den sperrenden Nutzer.
  const acquire = lock.acquire
  const [lockTried, setLockTried] = React.useState(isNew || Boolean(readOnly))
  React.useEffect(() => {
    if (isNew || readOnly) return
    let cancelled = false
    void acquire().then(() => {
      if (!cancelled) setLockTried(true)
    })
    return () => {
      cancelled = true
    }
  }, [acquire, isNew, readOnly])

  const lockLost = lock.status === "lost"
  const canEdit = !readOnly && (isNew || lock.status === "held") && !lockLost
  const fieldsDisabled = !canEdit || busy

  const submit = React.useCallback(
    async (values: ContactFormValues): Promise<boolean> => {
      setFormError(null)
      setBusy(true)
      try {
        const body = toContactPayload(values)
        const result = contact
          ? await apiRequest(`/api/tenants/${tenantId}/contacts/${contact.id}`, {
              method: "PATCH",
              body,
            })
          : await apiRequest(`/api/tenants/${tenantId}/contacts`, {
              method: "POST",
              body: { ...body, addressId },
            })
        if (!result.ok) {
          if (result.field && result.field in values) {
            form.setError(result.field as keyof ContactFormValues, { message: result.error })
          } else {
            setFormError(result.error)
          }
          return false
        }
        toast.success(contact ? "Kontakt gespeichert" : "Kontakt angelegt")
        form.reset(values)
        await lock.release()
        onSaved()
        router.refresh()
        onClose()
        return true
      } finally {
        setBusy(false)
      }
    },
    [addressId, contact, form, lock, onClose, onSaved, router, setBusy, tenantId]
  )

  const handleSubmit = form.handleSubmit((values) => submit(values))
  // Der Dialog hängt per Portal im React-Baum des Adressformulars: ohne stopPropagation würde das
  // submit-Event auch das Adressformular absenden.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.stopPropagation()
    return handleSubmit(event)
  }

  // Logout-Abfrage: offene Änderungen am Kontakt speichern oder verwerfen.
  useUnsavedChangesEntry({
    isDirty: () => canEdit && isDirty,
    save: async () => {
      let ok = false
      await form.handleSubmit(async (values) => {
        ok = await submit(values)
      })()
      return ok
    },
    discard: async () => {
      if (!isNew) await lock.release()
    },
  })

  async function close() {
    setDiscardOpen(false)
    await lock.release()
    onClose()
  }

  function requestClose() {
    if (canEdit && isDirty) setDiscardOpen(true)
    else void close()
  }
  const requestCloseRef = React.useRef(requestClose)
  requestCloseRef.current = requestClose
  React.useEffect(() => {
    closeRequest.current = () => requestCloseRef.current()
    return () => {
      closeRequest.current = null
    }
  }, [closeRequest])

  async function reacquire() {
    const result = await lock.acquire()
    if (!result.ok) toast.error("Sperren nicht möglich", { description: result.message })
  }

  const c = form.control

  return (
    <>
      {!isNew && !readOnly && lockTried && (
        <EditLockBanner
          lock={lock}
          noun="Kontakt"
          onReacquire={reacquire}
          reacquiring={lock.status === "acquiring"}
        />
      )}

      {formError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {formError} Deine Eingaben bleiben erhalten.
        </p>
      )}

      <Form {...form}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={c}
              name="salutation"
              label="Anrede"
              disabled={fieldsDisabled}
              maxLength={30}
              placeholder="z. B. Herr, Frau"
            />
            <TextField
              control={c}
              name="firstName"
              label="Vorname"
              disabled={fieldsDisabled}
              maxLength={100}
            />
            <div className="sm:col-span-2">
              <TextField
                control={c}
                name="lastName"
                label="Nachname"
                required
                disabled={fieldsDisabled}
                maxLength={100}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField
                control={c}
                name="functionTitle"
                label="Funktion / Position"
                disabled={fieldsDisabled}
                maxLength={100}
              />
            </div>
            <TextField control={c} name="phone" label="Telefon" disabled={fieldsDisabled} maxLength={50} />
            <TextField control={c} name="mobile" label="Mobil" disabled={fieldsDisabled} maxLength={50} />
            <div className="sm:col-span-2">
              <TextField
                control={c}
                name="email"
                label="E-Mail"
                disabled={fieldsDisabled}
                maxLength={254}
              />
            </div>
            <div className="sm:col-span-2">
              <TextAreaField
                control={c}
                name="remark"
                label="Bemerkung"
                disabled={fieldsDisabled}
                maxLength={2000}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
              {canEdit ? "Abbrechen" : "Schließen"}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={busy || lockLost}>
                {busy ? "Wird gespeichert …" : isNew ? "Anlegen" : "Speichern"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </Form>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Änderungen verwerfen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deine ungespeicherten Änderungen am Kontakt gehen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Weiter bearbeiten</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void close()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
