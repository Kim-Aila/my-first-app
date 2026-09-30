import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { ChangePasswordForm } from "@/components/profil/change-password-form"
import { StatusBadge } from "@/components/status-badge"
import { getSessionContext } from "@/lib/session-context"

export const metadata: Metadata = { title: "Profil · Manufaktur-ERP" }

export default async function ProfilPage() {
  const session = await getSessionContext()

  return (
    <>
      <PageHeader title="Profil" description="Deine Kontodaten und dein Passwort" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="font-display text-xl font-medium">Konto</CardTitle>
            <CardDescription>Diese Angaben pflegt dein Administrator.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Benutzername
                </dt>
                <dd className="mt-1 break-all font-medium">{session.username}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  E-Mail
                </dt>
                <dd className="mt-1 break-all">{session.email ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Mandanten
                </dt>
                <dd className="mt-1">
                  {session.tenants.length > 0
                    ? session.tenants.map((t) => t.name).join(", ")
                    : "Keinem Mandanten zugeordnet"}
                </dd>
              </div>
              {session.isSuperAdmin && (
                <div>
                  <dt className="sr-only">Rolle</dt>
                  <dd>
                    <StatusBadge tone="pending">Super-Admin</StatusBadge>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl font-medium">Passwort ändern</CardTitle>
            <CardDescription>
              Zur Bestätigung benötigst du dein aktuelles Passwort.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
