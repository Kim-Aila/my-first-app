"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { RoleCheckboxList } from "@/components/benutzerverwaltung/role-checkbox-list"
import type { TenantRole } from "@/components/benutzerverwaltung/types"
import { apiRequest } from "@/lib/api-client"
import { PASSWORD_POLICY_HINT, passwordSchema } from "@/lib/password-policy"

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Benutzernamen ein")
    .max(100, "Der Benutzername darf höchstens 100 Zeichen lang sein"),
  email: z
    .string()
    .trim()
    .min(1, "Bitte gib eine E-Mail-Adresse ein")
    .email("Bitte gib eine gültige E-Mail-Adresse ein"),
  password: passwordSchema,
  roleIds: z.array(z.string()),
})

type CreateUserValues = z.infer<typeof createUserSchema>

const EMPTY_VALUES: CreateUserValues = { username: "", email: "", password: "", roleIds: [] }

interface CreateUserDialogProps {
  tenantId: string
  tenantName: string
  roles: TenantRole[]
}

export function CreateUserDialog({ tenantId, tenantName, roles }: CreateUserDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: EMPTY_VALUES,
  })

  function handleOpenChange(next: boolean) {
    if (loading) return
    setOpen(next)
    if (next) {
      form.reset(EMPTY_VALUES)
      setError(null)
    }
  }

  async function onSubmit(values: CreateUserValues) {
    setError(null)
    setLoading(true)

    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/users`, {
        method: "POST",
        body: {
          username: values.username.trim(),
          email: values.email.trim(),
          password: values.password,
          roleIds: values.roleIds,
        },
      })

      if (!result.ok) {
        // Eingaben bleiben erhalten (Spec-Edge-Case "API nicht erreichbar").
        // Ein konkretes `field` hat Vorrang; 409 ohne Feld → Benutzername (BUG-8).
        if (result.field === "email" || result.field === "password") {
          form.setError(result.field, { message: result.error })
        } else if (result.field === "username" || result.status === 409) {
          form.setError("username", { message: result.error })
        } else {
          setError(result.error)
        }
        return
      }

      toast.success("Benutzer angelegt", {
        description: `${values.username.trim()} kann sich jetzt in „${tenantName}“ anmelden.`,
      })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
          Neuer Benutzer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">Neuer Benutzer</DialogTitle>
          <DialogDescription>
            Der Benutzer wird neu angelegt und dem Mandanten „{tenantName}“ zugeordnet.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Benutzername</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" autoFocus disabled={loading} {...field} />
                  </FormControl>
                  <FormDescription>Wird für die Anmeldung verwendet und muss systemweit eindeutig sein.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-Mail</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" disabled={loading} {...field} />
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
                  <FormLabel>Initial-Passwort</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      disabled={loading}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {PASSWORD_POLICY_HINT} Der Benutzer kann es danach im Profil selbst ändern.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roleIds"
              render={({ field }) => (
                <FormItem>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Rollen</legend>
                    <RoleCheckboxList
                      idPrefix="create-user-role"
                      roles={roles}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={loading}
                    />
                  </fieldset>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Wird angelegt …" : "Benutzer anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
