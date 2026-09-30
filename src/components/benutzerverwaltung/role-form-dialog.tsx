"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Label } from "@/components/ui/label"
import type { TenantRole } from "@/components/benutzerverwaltung/types"
import { apiRequest } from "@/lib/api-client"
import { MASKS, maskKey } from "@/lib/masks"

const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Rollennamen ein")
    .max(100, "Der Rollenname darf höchstens 100 Zeichen lang sein"),
  masks: z.array(z.string()),
})

type RoleValues = z.infer<typeof roleSchema>

interface RoleFormDialogProps {
  tenantId: string
  tenantName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ohne `role` wird eine neue Rolle angelegt, mit `role` bearbeitet. */
  role: TenantRole | null
  existingRoleNames: string[]
}

function valuesFor(role: TenantRole | null): RoleValues {
  return { name: role?.name ?? "", masks: role ? role.masks.map(maskKey) : [] }
}

export function RoleFormDialog({
  tenantId,
  tenantName,
  open,
  onOpenChange,
  role,
  existingRoleNames,
}: RoleFormDialogProps) {
  const [loading, setLoading] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (loading) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">
            {role ? "Rolle bearbeiten" : "Neue Rolle"}
          </DialogTitle>
          <DialogDescription>
            Rollen gelten nur im Mandanten „{tenantName}“. Eine Rolle bündelt die Masken, die ihre
            Benutzer sehen dürfen.
          </DialogDescription>
        </DialogHeader>
        {/* DialogContent wird beim Schließen ausgehängt → Formular startet bei jedem Öffnen frisch. */}
        <RoleForm
          key={role?.id ?? "new"}
          tenantId={tenantId}
          role={role}
          existingRoleNames={existingRoleNames}
          loading={loading}
          setLoading={setLoading}
          onCancel={() => handleOpenChange(false)}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

interface RoleFormProps {
  tenantId: string
  role: TenantRole | null
  existingRoleNames: string[]
  loading: boolean
  setLoading: (loading: boolean) => void
  onCancel: () => void
  onSaved: () => void
}

function RoleForm({
  tenantId,
  role,
  existingRoleNames,
  loading,
  setLoading,
  onCancel,
  onSaved,
}: RoleFormProps) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: valuesFor(role),
  })

  async function onSubmit(values: RoleValues) {
    setError(null)

    const normalized = values.name.trim().toLocaleLowerCase("de-DE")
    const ownName = role?.name.trim().toLocaleLowerCase("de-DE")
    const duplicate = existingRoleNames.some((n) => {
      const other = n.trim().toLocaleLowerCase("de-DE")
      return other === normalized && other !== ownName
    })
    if (duplicate) {
      form.setError("name", {
        message: "In diesem Mandanten gibt es bereits eine Rolle mit diesem Namen",
      })
      return
    }

    const masks = MASKS.filter((m) => values.masks.includes(maskKey(m))).map((m) => ({
      module: m.module,
      maske: m.maske,
    }))

    setLoading(true)
    try {
      const result = await apiRequest(
        role ? `/api/tenants/${tenantId}/roles/${role.id}` : `/api/tenants/${tenantId}/roles`,
        { method: role ? "PATCH" : "POST", body: { name: values.name.trim(), masks } }
      )

      if (!result.ok) {
        if (result.field === "name" || result.status === 409) {
          form.setError("name", { message: result.error })
        } else {
          setError(result.error)
        }
        return
      }

      toast.success(role ? "Rolle gespeichert" : "Rolle angelegt", {
        description: values.name.trim(),
      })
      onSaved()
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="off"
                  autoFocus
                  placeholder="z. B. Administrator"
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
          name="masks"
          render={({ field }) => (
            <FormItem>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Masken</legend>
                <div className="space-y-3 rounded-md border p-3">
                  {MASKS.map((mask) => {
                    const key = maskKey(mask)
                    const id = `role-mask-${key.replace(/[^a-z0-9]/gi, "-")}`
                    return (
                      <div key={key} className="flex items-start gap-3">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={field.value.includes(key)}
                          disabled={loading}
                          aria-describedby={`${id}-desc`}
                          onCheckedChange={(next) =>
                            field.onChange(
                              next === true
                                ? [...field.value, key]
                                : field.value.filter((k) => k !== key)
                            )
                          }
                        />
                        <div className="grid gap-0.5">
                          <Label htmlFor={id} className="cursor-pointer">
                            {mask.label}
                          </Label>
                          <p id={`${id}-desc`} className="text-xs text-muted-foreground">
                            {mask.description}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Weitere Masken kommen mit den nächsten Modulen hinzu.
                </p>
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
            onClick={onCancel}
            disabled={loading}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Wird gespeichert …" : role ? "Speichern" : "Rolle anlegen"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
