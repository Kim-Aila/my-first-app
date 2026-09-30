import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { getSessionContext } from "@/lib/session-context"

export default async function Home() {
  const session = await getSessionContext()

  return (
    <>
      <PageHeader
        title="Willkommen"
        description={`Eingeloggt als ${session.username}${session.isSuperAdmin ? " (Super-Admin)" : ""}`}
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="font-display text-xl font-medium">Startseite</CardTitle>
          <CardDescription>
            {session.tenants.length === 0
              ? "Du bist aktuell keinem Mandanten zugeordnet."
              : `Zugriff auf ${session.tenants.length} Mandant${session.tenants.length === 1 ? "" : "en"}: ${session.tenants.map((t) => t.name).join(", ")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Die eigentliche Startseite mit echten Kennzahlen entsteht mit den nächsten Modulen (ab
            PROJ-3). Über die Navigation links erreichst du die Bereiche, für die du freigeschaltet
            bist.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
