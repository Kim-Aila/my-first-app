"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"

const tenantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Namen ein")
    .max(100, "Der Name darf höchstens 100 Zeichen lang sein"),
})

type TenantValues = z.infer<typeof tenantSchema>

interface TenantFormDialogProps {
  /** Ohne `tenant` wird ein neuer Mandant angelegt, mit `tenant` umbenannt. */
  tenant?: { id: string; name: string }
  /** Namen bestehender Mandanten für eine freundliche Vorab-Prüfung (maßgeblich ist der Server). */
  existingNames: string[]
  trigger: React.ReactNode
}

export function TenantFormDialog({ tenant, existingNames, trigger }: TenantFormDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const isEdit = Boolean(tenant)

  const form = useForm<TenantValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: { name: tenant?.name ?? "" },
  })

  function handleOpenChange(next: boolean) {
    if (loading) return
    setOpen(next)
    if (next) {
      form.reset({ name: tenant?.name ?? "" })
      setError(null)
    }
  }

  async function onSubmit(values: TenantValues) {
    setError(null)

    const normalized = values.name.trim().toLocaleLowerCase("de-DE")
    const duplicate = existingNames.some(
      (n) =>
        n.trim().toLocaleLowerCase("de-DE") === normalized &&
        n.trim().toLocaleLowerCase("de-DE") !== tenant?.name.trim().toLocaleLowerCase("de-DE")
    )
    if (duplicate) {
      form.setError("name", { message: "Ein Mandant mit diesem Namen existiert bereits" })
      return
    }

    setLoading(true)
    try {
      const result = await apiRequest(
        isEdit ? `/api/tenants/${tenant!.id}` : "/api/tenants",
        { method: isEdit ? "PATCH" : "POST", body: { name: values.name.trim() } }
      )

      if (!result.ok) {
        if (result.field === "name" || result.status === 409) {
          form.setError("name", { message: result.error })
        } else {
          setError(result.error)
        }
        return
      }

      toast.success(isEdit ? "Mandant umbenannt" : "Mandant angelegt", {
        description: values.name.trim(),
      })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">
            {isEdit ? "Mandant umbenennen" : "Neuer Mandant"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Der Name muss systemweit eindeutig sein."
              : "Der neue Mandant startet leer — lege danach in der Benutzerverwaltung die erste Rolle und den ersten Benutzer an."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus autoComplete="off" disabled={loading} {...field} />
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
                {loading ? "Wird gespeichert …" : isEdit ? "Umbenennen" : "Anlegen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
