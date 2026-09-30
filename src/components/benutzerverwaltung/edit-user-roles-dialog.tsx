"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
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
import { RoleCheckboxList } from "@/components/benutzerverwaltung/role-checkbox-list"
import type { TenantRole, TenantUser } from "@/components/benutzerverwaltung/types"
import { apiRequest } from "@/lib/api-client"

interface EditUserRolesDialogProps {
  tenantId: string
  user: TenantUser | null
  roles: TenantRole[]
  onOpenChange: (open: boolean) => void
}

export function EditUserRolesDialog({ tenantId, user, roles, onOpenChange }: EditUserRolesDialogProps) {
  const router = useRouter()
  const [roleIds, setRoleIds] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lastUserId, setLastUserId] = React.useState<string | null>(null)

  // Auswahl zurücksetzen, sobald der Dialog für einen (anderen) Benutzer geöffnet wird.
  if (user && user.id !== lastUserId) {
    setLastUserId(user.id)
    setRoleIds(user.roleIds)
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (loading) return
    if (!next) setLastUserId(null)
    onOpenChange(next)
  }

  async function handleSave() {
    if (!user) return
    setError(null)
    setLoading(true)
    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/users/${user.id}`, {
        method: "PATCH",
        body: { roleIds },
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Rollen gespeichert", { description: user.username })
      setLastUserId(null)
      onOpenChange(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">Rollen bearbeiten</DialogTitle>
          <DialogDescription>
            {user
              ? `Rollen von ${user.username} in diesem Mandanten. Die sichtbaren Masken ergeben sich aus allen gewählten Rollen zusammen.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Rollen</legend>
          <RoleCheckboxList
            idPrefix="edit-user-role"
            roles={roles}
            value={roleIds}
            onChange={setRoleIds}
            disabled={loading}
          />
        </fieldset>

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
          <Button type="button" onClick={handleSave} disabled={loading}>
            {loading ? "Wird gespeichert …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
