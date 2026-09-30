"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import { PASSWORD_POLICY_HINT, passwordSchema } from "@/lib/password-policy"

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Bitte bestätige das neue Passwort"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Die Passwörter stimmen nicht überein",
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "Das neue Passwort muss sich vom aktuellen unterscheiden",
  })

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export function ChangePasswordForm() {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  async function onSubmit(values: ChangePasswordValues) {
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const result = await apiRequest("/api/profile/password", {
        method: "POST",
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      })

      if (result.ok) {
        setSuccess(true)
        form.reset()
        return
      }

      if (result.field === "newPassword") {
        form.setError("newPassword", { message: result.error })
      } else if (result.status === 400 || result.status === 401) {
        // Bewusst allgemein formuliert — die Meldung verrät nicht, welche Prüfung fehlschlug.
        setError(
          result.status === 401
            ? "Das Passwort konnte nicht geändert werden. Bitte prüfe deine Eingaben."
            : result.error
        )
      } else {
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Aktuelles Passwort</FormLabel>
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

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Neues Passwort</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={loading} {...field} />
              </FormControl>
              <FormDescription>{PASSWORD_POLICY_HINT}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Neues Passwort bestätigen</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" disabled={loading} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        {success && (
          <Alert role="status" className="border-[#1F5138]/30 bg-[#E3EFE7] text-[#1F5138]">
            <CheckCircle2 className="h-4 w-4 !text-[#1F5138]" aria-hidden="true" />
            <AlertDescription>
              Dein Passwort wurde geändert. Du bleibst weiterhin angemeldet.
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? "Passwort wird geändert …" : "Passwort ändern"}
        </Button>
      </form>
    </Form>
  )
}
