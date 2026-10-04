"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

// Zentraler "Ungespeicherte Änderungen"-Merker (PROJ-3, Tech Design Entscheidung 9).
// Masken mit Bearbeitungsmodus melden sich über `useUnsavedChangesEntry` an; der Logout (und
// künftig jede andere "Verlassen"-Aktion) fragt nur `confirmLeave()` ab.

export interface UnsavedChangesEntry {
  isDirty: () => boolean
  /** true = gespeichert (Formular darf verlassen werden). */
  save: () => Promise<boolean>
  discard: () => Promise<void>
}

interface UnsavedChangesContextValue {
  register: (entry: React.RefObject<UnsavedChangesEntry>) => () => void
  /** true = Verlassen erlaubt (nichts offen, gespeichert oder verworfen). */
  confirmLeave: () => Promise<boolean>
}

const UnsavedChangesContext = React.createContext<UnsavedChangesContextValue | null>(null)

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const entriesRef = React.useRef(new Set<React.RefObject<UnsavedChangesEntry>>())
  const resolverRef = React.useRef<((leave: boolean) => void) | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<"save" | "discard" | null>(null)

  const dirtyEntries = React.useCallback(
    () => [...entriesRef.current].filter((ref) => ref.current.isDirty()),
    []
  )

  const register = React.useCallback((entry: React.RefObject<UnsavedChangesEntry>) => {
    entriesRef.current.add(entry)
    return () => {
      entriesRef.current.delete(entry)
    }
  }, [])

  const confirmLeave = React.useCallback(() => {
    if (dirtyEntries().length === 0) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false)
      resolverRef.current = resolve
      setOpen(true)
    })
  }, [dirtyEntries])

  const finish = React.useCallback((leave: boolean) => {
    resolverRef.current?.(leave)
    resolverRef.current = null
    setOpen(false)
    setBusy(null)
  }, [])

  async function handleSave() {
    setBusy("save")
    const results = await Promise.all(dirtyEntries().map((ref) => ref.current.save()))
    if (results.every(Boolean)) {
      finish(true)
    } else {
      toast.error("Speichern nicht möglich", {
        description: "Bitte prüfe die Eingaben im Formular. Du bleibst angemeldet.",
      })
      finish(false)
    }
  }

  async function handleDiscard() {
    setBusy("discard")
    await Promise.all(dirtyEntries().map((ref) => ref.current.discard()))
    finish(true)
  }

  // Browser-Warnung beim Tab-Schließen/Neuladen mit offenen Änderungen.
  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyEntries().length > 0) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirtyEntries])

  const value = React.useMemo(() => ({ register, confirmLeave }), [register, confirmLeave])

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => !next && !busy && finish(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Ungespeicherte Änderungen
            </AlertDialogTitle>
            <AlertDialogDescription>
              Du hast Änderungen, die noch nicht gespeichert sind. Möchtest du sie vor dem Abmelden
              speichern oder verwerfen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={busy !== null} onClick={() => finish(false)}>
              Abbrechen
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={handleDiscard}
              className="text-destructive hover:text-destructive"
            >
              {busy === "discard" ? "Wird verworfen …" : "Verwerfen & abmelden"}
            </Button>
            <Button disabled={busy !== null} onClick={handleSave}>
              {busy === "save" ? "Wird gespeichert …" : "Speichern & abmelden"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UnsavedChangesContext.Provider>
  )
}

export function useConfirmLeave() {
  const ctx = React.useContext(UnsavedChangesContext)
  return ctx?.confirmLeave ?? (() => Promise.resolve(true))
}

/** Meldet eine Maske beim Merker an; `entry` darf bei jedem Render neu sein. */
export function useUnsavedChangesEntry(entry: UnsavedChangesEntry) {
  const ctx = React.useContext(UnsavedChangesContext)
  const ref = React.useRef(entry)
  React.useEffect(() => {
    ref.current = entry
  })
  const register = ctx?.register
  React.useEffect(() => (register ? register(ref) : undefined), [register])
}
