"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api-client"
import {
  buildMerkmalSchema,
  merkmalDefaultValues,
  merkmalPayload,
  type MerkmalConfig,
  type MerkmalFormValues,
  type MerkmalItem,
} from "@/lib/merkmale"

interface MerkmalFormDialogProps {
  config: MerkmalConfig
  tenantId: string
  tenantName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ohne `item` wird ein neuer Eintrag angelegt. */
  item: MerkmalItem | null
}

export function MerkmalFormDialog({
  config,
  tenantId,
  tenantName,
  open,
  onOpenChange,
  item,
}: MerkmalFormDialogProps) {
  const [loading, setLoading] = React.useState(false)

  function handleOpenChange(next: boolean) {
    if (loading) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">
            {item ? `${config.singular} bearbeiten` : `Neuer Eintrag: ${config.singular}`}
          </DialogTitle>
          <DialogDescription>
            Gilt nur im Mandanten „{tenantName}“.
          </DialogDescription>
        </DialogHeader>
        {/* DialogContent wird beim Schließen ausgehängt → Formular startet bei jedem Öffnen frisch. */}
        <MerkmalForm
          key={item?.id ?? "new"}
          config={config}
          tenantId={tenantId}
          item={item}
          loading={loading}
          setLoading={setLoading}
          onCancel={() => handleOpenChange(false)}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function MerkmalForm({
  config,
  tenantId,
  item,
  loading,
  setLoading,
  onCancel,
  onSaved,
}: {
  config: MerkmalConfig
  tenantId: string
  item: MerkmalItem | null
  loading: boolean
  setLoading: (loading: boolean) => void
  onCancel: () => void
  onSaved: () => void
}) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const schema = React.useMemo(() => buildMerkmalSchema(config), [config])

  const form = useForm<MerkmalFormValues>({
    // Das Schema wird aus der Konfiguration gebaut; alle Felder sind Strings.
    resolver: zodResolver(schema) as unknown as Resolver<MerkmalFormValues>,
    defaultValues: merkmalDefaultValues(config, item),
  })

  async function onSubmit(values: MerkmalFormValues) {
    setError(null)
    setLoading(true)
    try {
      const base = `/api/tenants/${tenantId}/merkmale/${config.slug}`
      const result = await apiRequest(item ? `${base}/${item.id}` : base, {
        method: item ? "PATCH" : "POST",
        body: merkmalPayload(config, values),
      })

      if (!result.ok) {
        const field = config.fields.find((f) => f.key === result.field)
        if (field) {
          form.setError(field.key, { message: result.error })
        } else if (result.status === 409) {
          // Eindeutigkeit: Kürzel/Nummer (bzw. Satz/Bezeichnung) ist im Mandanten schon vergeben.
          form.setError(config.fields[0].key, { message: result.error })
        } else {
          setError(result.error)
        }
        return
      }

      toast.success(item ? "Eintrag gespeichert" : "Eintrag angelegt", {
        description: config.singular,
      })
      onSaved()
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {config.fields.map((field, index) => (
          <FormField
            key={field.key}
            control={form.control}
            name={field.key}
            render={({ field: rhf }) => (
              <FormItem>
                <FormLabel>
                  {field.label}
                  {field.unit && (
                    <span className="font-normal text-muted-foreground"> ({field.unit})</span>
                  )}
                  {field.required && <span aria-hidden="true"> *</span>}
                </FormLabel>
                <FormControl>
                  <Input
                    {...rhf}
                    autoComplete="off"
                    autoFocus={index === 0}
                    disabled={loading}
                    maxLength={field.kind === "digit" ? 1 : field.maxLength}
                    inputMode={
                      field.kind === "digit"
                        ? "numeric"
                        : field.kind === "decimal"
                          ? "decimal"
                          : "text"
                    }
                  />
                </FormControl>
                {field.hint && <FormDescription>{field.hint}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Wird gespeichert …" : item ? "Speichern" : "Anlegen"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
