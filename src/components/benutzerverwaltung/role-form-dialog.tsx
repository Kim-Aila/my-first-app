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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TenantRole } from "@/components/benutzerverwaltung/types"
import { apiRequest } from "@/lib/api-client"
import { ACCESS_LEVEL_LABELS, MASKS, groupMasks, maskKey, type AccessLevel } from "@/lib/masks"

const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Rollennamen ein")
    .max(100, "Der Rollenname darf höchstens 100 Zeichen lang sein"),
  // Maskenschlüssel → Zugriffsstufe ("none" = kein Zugriff)
  masks: z.record(z.string(), z.enum(["none", "read", "write"])),
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
  const masks: RoleValues["masks"] = {}
  for (const mask of MASKS) {
    const permission = role?.masks.find((m) => maskKey(m) === maskKey(mask))
    masks[maskKey(mask)] = permission ? permission.accessLevel : "none"
  }
  return { name: role?.name ?? "", masks }
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
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">
            {role ? "Rolle bearbeiten" : "Neue Rolle"}
          </DialogTitle>
          <DialogDescription>
            Rollen gelten nur im Mandanten „{tenantName}“. Eine Rolle bündelt die Masken, die ihre
            Benutzer nutzen dürfen, und ob sie dort nur lesen oder auch bearbeiten.
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

    const masks = MASKS.filter((m) => (values.masks[maskKey(m)] ?? "none") !== "none").map((m) => ({
      module: m.module,
      maske: m.maske,
      // Masken ohne Lese-Stufe (Benutzerverwaltung) kennen nur "Zugriff" = "write".
      accessLevel: (m.supportsReadOnly ? values.masks[maskKey(m)] : "write") as AccessLevel,
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
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Masken und Zugriff</legend>
                <div className="space-y-4 rounded-md border p-3">
                  {groupMasks().map(({ group, masks }) => (
                    <div key={group} className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group}
                      </p>
                      {masks.map((mask) => {
                        const key = maskKey(mask)
                        const id = `role-mask-${key.replace(/[^a-z0-9]/gi, "-")}`
                        const value = field.value[key] ?? "none"
                        return (
                          <div
                            key={key}
                            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="grid gap-0.5">
                              <Label htmlFor={id}>{mask.label}</Label>
                              <p id={`${id}-desc`} className="text-xs text-muted-foreground">
                                {mask.description}
                              </p>
                            </div>
                            <Select
                              value={value}
                              disabled={loading}
                              onValueChange={(next) => field.onChange({ ...field.value, [key]: next })}
                            >
                              <SelectTrigger
                                id={id}
                                aria-describedby={`${id}-desc`}
                                className="w-full sm:w-52"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Kein Zugriff</SelectItem>
                                {mask.supportsReadOnly ? (
                                  <>
                                    <SelectItem value="read">{ACCESS_LEVEL_LABELS.read}</SelectItem>
                                    <SelectItem value="write">{ACCESS_LEVEL_LABELS.write}</SelectItem>
                                  </>
                                ) : (
                                  <SelectItem value="write">Zugriff</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  „Lesen“ erlaubt nur Ansehen; „Lesen + Bearbeiten“ auch Anlegen und Ändern.
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
