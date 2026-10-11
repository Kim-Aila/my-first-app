"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, FileUp } from "lucide-react"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiUpload } from "@/lib/api-client"
import {
  IMPORT_COUNT_LABELS,
  IMPORT_MAX_BYTES,
  formatQuantity,
  wipesStock,
  type ImportOutcome,
} from "@/lib/stock"

type Phase = "select" | "previewing" | "preview" | "committing" | "done"

const MAX_LISTED_ARTICLES = 50

function CountTiles({ outcome }: { outcome: ImportOutcome }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {IMPORT_COUNT_LABELS.map(({ key, label }) => (
        <div key={key} className="rounded-[18px] border bg-card p-4">
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-display text-2xl font-medium tabular-nums">
            {formatQuantity(outcome.counts[key])}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function OutcomeDetails({ outcome }: { outcome: ImportOutcome }) {
  const unknownShown = outcome.unknownArticles.slice(0, MAX_LISTED_ARTICLES)
  const unknownRest = outcome.unknownArticles.length - unknownShown.length
  return (
    <div className="space-y-4">
      <CountTiles outcome={outcome} />

      {outcome.unknownArticles.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            {outcome.unknownArticles.length}{" "}
            {outcome.unknownArticles.length === 1 ? "Artikelnummer" : "Artikelnummern"} nicht im Artikelstamm
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Der Bestand wird trotzdem geführt und ordnet sich automatisch zu, sobald der Artikel
              angelegt ist.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {unknownShown.map((number) => (
                <li key={number}>
                  <Badge variant="outline" className="font-normal tabular-nums">
                    {number}
                  </Badge>
                </li>
              ))}
              {unknownRest > 0 && <li className="text-xs text-muted-foreground">und {unknownRest} weitere</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="import-errors-heading" className="space-y-2">
        <h3 id="import-errors-heading" className="font-display text-lg font-medium">
          Fehler ({outcome.errors.length})
        </h3>
        {outcome.errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Fehler.</p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border bg-card">
            <Table>
              <caption className="sr-only">Fehler im Import mit SSCC und Artikel</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider">SSCC</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Artikel</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Meldung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outcome.errors.map((entry, index) => (
                  <TableRow key={`${entry.sscc}-${entry.articleNumber}-${index}`}>
                    <TableCell className="font-medium tabular-nums">{entry.sscc || "–"}</TableCell>
                    <TableCell className="tabular-nums">{entry.articleNumber ?? "–"}</TableCell>
                    <TableCell>{entry.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Betroffene Positionen bleiben unverändert und werden nicht als fehlend markiert.
        </p>
      </section>

      <section aria-labelledby="import-skipped-heading" className="space-y-2">
        <h3 id="import-skipped-heading" className="font-display text-lg font-medium">
          Übersprungene Zeilen ({outcome.skippedCount})
        </h3>
        {outcome.skipped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Zeilen übersprungen.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {outcome.skipped.map((group) => (
              <li key={group.reason} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-3 py-2">
                <span>{group.reason}</span>
                <span className="text-muted-foreground">
                  {group.count} {group.count === 1 ? "Zeile" : "Zeilen"}
                  {group.lines.length > 0 && (
                    <>
                      {" "}
                      (Zeile {group.lines.join(", ")}
                      {group.count > group.lines.length ? " …" : ""})
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Import-Assistent: Datei wählen → Vorschau (nichts gespeichert) → Übernehmen → Ergebnis. */
export function ImportWizard({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>("select")
  const [file, setFile] = React.useState<File | null>(null)
  const [outcome, setOutcome] = React.useState<ImportOutcome | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmWipeOpen, setConfirmWipeOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const base = `/api/tenants/${encodeURIComponent(tenantId)}/stock/imports`

  function reset() {
    setPhase("select")
    setFile(null)
    setOutcome(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    setError(null)
    if (next && next.size > IMPORT_MAX_BYTES) {
      setError("Die Datei ist größer als 25 MB und kann nicht importiert werden.")
      setFile(null)
    }
  }

  async function runPreview() {
    if (!file) return
    setPhase("previewing")
    setError(null)
    const result = await apiUpload<ImportOutcome>(`${base}/preview`, file)
    if (result.ok) {
      setOutcome(result.data)
      setPhase("preview")
    } else {
      setError(result.error)
      setPhase("select")
    }
  }

  async function runCommit() {
    if (!file) return
    setConfirmWipeOpen(false)
    setPhase("committing")
    setError(null)
    const result = await apiUpload<ImportOutcome>(base, file)
    if (result.ok) {
      setOutcome(result.data)
      setPhase("done")
      // Protokoll, Zähler an der Prüfliste und Leerzustand neu laden.
      router.refresh()
    } else {
      setError(
        result.status === 409
          ? `${result.error} Es wurde nichts übernommen.`
          : `${result.error} Es wurde nichts übernommen; der Bestand ist unverändert.`
      )
      setPhase("preview")
    }
  }

  const busy = phase === "previewing" || phase === "committing"
  const wipes = outcome ? wipesStock(outcome) : false

  return (
    <div className="space-y-6">
      {(phase === "select" || phase === "previewing") && (
        <section className="rounded-[18px] border bg-card p-6" aria-labelledby="import-select-heading">
          <h2 id="import-select-heading" className="font-display text-lg font-medium">
            1. Bestandsdatei auswählen
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vollabzug des Lagersystems (CSV, Semikolon-getrennt). Es wird immer der gesamte Bestand des
            Mandanten ersetzt. In der Vorschau wird noch nichts gespeichert.
          </p>
          <div className="mt-4 max-w-md space-y-1.5">
            <Label htmlFor="import-file">CSV-Datei</Label>
            <Input
              id="import-file"
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              disabled={busy}
              className="bg-card"
            />
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Datei abgelehnt</AlertTitle>
              <AlertDescription>{error} Der Bestand ist unverändert.</AlertDescription>
            </Alert>
          )}
          {phase === "previewing" && (
            <div className="mt-4 max-w-md space-y-1.5" role="status">
              <Progress value={100} className="animate-pulse" aria-label="Datei wird geprüft" />
              <p className="text-sm text-muted-foreground">Datei wird geprüft und mit dem Bestand verglichen …</p>
            </div>
          )}
          <Button className="mt-4" disabled={!file || busy} onClick={() => void runPreview()}>
            <FileUp className="mr-1 h-4 w-4" aria-hidden="true" />
            {phase === "previewing" ? "Wird geprüft …" : "Vorschau erstellen"}
          </Button>
        </section>
      )}

      {(phase === "preview" || phase === "committing") && outcome && (
        <section className="space-y-4" aria-labelledby="import-preview-heading">
          <div>
            <h2 id="import-preview-heading" className="font-display text-lg font-medium">
              2. Vorschau: {outcome.fileName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatQuantity(outcome.recordCount)} Datensätze gelesen. Noch ist nichts gespeichert.
            </p>
          </div>

          {wipes && (
            <Alert variant="destructive" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Die Datei enthält keine Datensätze</AlertTitle>
              <AlertDescription>
                Bei Übernahme würden alle {formatQuantity(outcome.counts.missing)} Positionen im Lager
                als „Fehlt, ungeprüft“ markiert. Bitte prüfe, ob die richtige Datei gewählt wurde.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Übernahme fehlgeschlagen</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <OutcomeDetails outcome={outcome} />

          {phase === "committing" && (
            <div className="max-w-md space-y-1.5" role="status">
              <Progress value={100} className="animate-pulse" aria-label="Bestand wird übernommen" />
              <p className="text-sm text-muted-foreground">Bestand wird übernommen – bitte nicht schließen …</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant={wipes ? "destructive" : "default"}
              disabled={busy}
              onClick={() => (wipes ? setConfirmWipeOpen(true) : void runCommit())}
            >
              {phase === "committing" ? "Wird übernommen …" : wipes ? "Trotzdem übernehmen" : "Übernehmen"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={reset}>
              Abbrechen
            </Button>
          </div>
        </section>
      )}

      {phase === "done" && outcome && (
        <section className="space-y-4" aria-labelledby="import-done-heading">
          <Alert role="status">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <AlertTitle id="import-done-heading">Import abgeschlossen</AlertTitle>
            <AlertDescription>
              {outcome.fileName} wurde übernommen und im Protokoll gespeichert.
            </AlertDescription>
          </Alert>
          <OutcomeDetails outcome={outcome} />
          <Button variant="outline" onClick={reset}>
            Weitere Datei importieren
          </Button>
        </section>
      )}

      <AlertDialog open={confirmWipeOpen} onOpenChange={setConfirmWipeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Gesamten Bestand als fehlend markieren?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Die Datei enthält keine Positionen. Alle {outcome ? formatQuantity(outcome.counts.missing) : ""}{" "}
              Positionen im Lager würden „Fehlt, ungeprüft“ und müssten einzeln geprüft werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runCommit()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ja, übernehmen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
