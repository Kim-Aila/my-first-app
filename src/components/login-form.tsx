"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const loginSchema = z.object({
  username: z.string().min(1, "Bitte gib deinen Benutzernamen ein"),
  password: z.string().min(1, "Bitte gib dein Passwort ein"),
})

type LoginValues = z.infer<typeof loginSchema>

type LoginError =
  | { type: "invalid"; remainingAttempts: number }
  | { type: "locked"; lockedUntil?: string }
  | { type: "connection" }
  | { type: "generic"; message: string }

function formatLockedUntil(lockedUntil?: string) {
  if (!lockedUntil) return "in 15 Minuten"
  const date = new Date(lockedUntil)
  if (Number.isNaN(date.getTime())) return "in 15 Minuten"
  return `um ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
}

export function LoginForm() {
  const [loading, setLoading] = React.useState(false)
  const [loginError, setLoginError] = React.useState<LoginError | null>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  })

  async function onSubmit(values: LoginValues) {
    setLoginError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      let data: {
        success?: boolean
        remainingAttempts?: number
        lockedUntil?: string
        error?: string
      } | null = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (res.ok && data?.success) {
        window.location.href = "/"
        return
      }

      if (res.status === 423 || data?.lockedUntil) {
        setLoginError({ type: "locked", lockedUntil: data?.lockedUntil })
      } else if (typeof data?.remainingAttempts === "number") {
        setLoginError({ type: "invalid", remainingAttempts: data.remainingAttempts })
      } else {
        setLoginError({
          type: "generic",
          message: data?.error ?? "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
        })
      }
    } catch {
      setLoginError({ type: "connection" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Benutzername</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoFocus
                  disabled={loading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passwort</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  disabled={loading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {loginError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {loginError.type === "invalid" &&
              `Benutzername oder Passwort ist falsch. Noch ${loginError.remainingAttempts} Versuch${loginError.remainingAttempts === 1 ? "" : "e"} übrig.`}
            {loginError.type === "locked" &&
              `Zu viele Fehlversuche. Der Account ist gesperrt, versuche es erneut ${formatLockedUntil(loginError.lockedUntil)}.`}
            {loginError.type === "connection" &&
              "Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut."}
            {loginError.type === "generic" && loginError.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Anmelden …" : "Anmelden"}
        </Button>
      </form>
    </Form>
  )
}
