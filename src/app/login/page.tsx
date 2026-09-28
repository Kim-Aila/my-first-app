import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="stroke-primary-foreground"
            >
              <ellipse cx="12" cy="12" rx="6" ry="9" />
              <path d="M12 3c-2 4-2 14 0 18" />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
              Manufaktur-ERP
            </h1>
            <p className="text-sm text-muted-foreground">Melde dich mit deinem Benutzerkonto an</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl font-medium">Anmelden</CardTitle>
            <CardDescription>Zugangsdaten erhältst du von deinem Administrator</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
