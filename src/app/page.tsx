import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-medium">Willkommen</CardTitle>
          <CardDescription>
            Basis-Setup von PROJ-1 ist eingerichtet. Die eigentliche Startseite mit echten
            Kennzahlen entsteht mit den nächsten Modulen (ab PROJ-3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Diese Seite ist aktuell noch nicht durch einen echten Login geschützt — das wird mit{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">/backend</code> für
            PROJ-1 ergänzt.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Zur Anmeldung →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
