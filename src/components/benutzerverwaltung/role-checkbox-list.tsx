"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface RoleCheckboxListProps {
  idPrefix: string
  roles: { id: string; name: string }[]
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

/** Rollen-Auswahl per Checkbox (mehrere Rollen pro Benutzer und Mandant, additiv). */
export function RoleCheckboxList({
  idPrefix,
  roles,
  value,
  onChange,
  disabled,
}: RoleCheckboxListProps) {
  if (roles.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
        In diesem Mandanten gibt es noch keine Rollen. Lege sie im Tab „Rollen“ an — der Benutzer
        kann sich auch ohne Rolle anmelden, sieht dann aber keine Masken.
      </p>
    )
  }

  return (
    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
      {roles.map((role) => {
        const id = `${idPrefix}-${role.id}`
        const checked = value.includes(role.id)
        return (
          <div key={role.id} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) =>
                onChange(
                  next === true
                    ? [...value, role.id]
                    : value.filter((roleId) => roleId !== role.id)
                )
              }
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">
              {role.name}
            </Label>
          </div>
        )
      })}
    </div>
  )
}
