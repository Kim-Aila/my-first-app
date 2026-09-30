"use client"

import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-lg" role="alert">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
        </div>
        <CardTitle className="font-display text-xl font-medium">Etwas ist schiefgelaufen</CardTitle>
        <CardDescription>
          Die Seite konnte nicht geladen werden. Bitte versuche es erneut.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button onClick={reset}>Erneut versuchen</Button>
      </CardContent>
    </Card>
  )
}
