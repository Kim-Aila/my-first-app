import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient as createServerClient } from "@/lib/supabase-server"

export default async function Home() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("username, is_super_admin")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-medium">Willkommen</CardTitle>
          <CardDescription>
            Eingeloggt als {profile?.username ?? user?.email}
            {profile?.is_super_admin ? " (Super-Admin)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Basis-Setup von PROJ-1 ist eingerichtet. Die eigentliche Startseite mit echten
            Kennzahlen entsteht mit den nächsten Modulen (ab PROJ-3).
          </p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm font-medium text-primary hover:underline"
            >
              Abmelden
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
