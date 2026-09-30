import { AlertTriangle, Lock } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Gemeinsame Zustandsanzeigen (Fehler / kein Zugriff / leer) für die Verwaltungsseiten.

export function LoadErrorAlert({
  title = "Daten konnten nicht geladen werden",
  description = "Die Verbindung zur Datenbank ist fehlgeschlagen oder die Daten sind noch nicht verfügbar. Bitte lade die Seite neu oder versuche es später erneut.",
}: {
  title?: string
  description?: string
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}

export function NoAccessCard({ description }: { description?: string }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <CardTitle className="font-display text-xl font-medium">Kein Zugriff</CardTitle>
        <CardDescription>
          {description ??
            "Für diesen Bereich fehlt dir die Berechtigung. Wende dich bei Bedarf an deinen Administrator."}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
