"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RoleFormDialog } from "@/components/benutzerverwaltung/role-form-dialog"
import type { TenantRole } from "@/components/benutzerverwaltung/types"
import { EmptyState } from "@/components/state-messages"
import { apiRequest } from "@/lib/api-client"
import { getMaskLabel } from "@/lib/masks"

interface RolesTabProps {
  tenantId: string
  tenantName: string
  roles: TenantRole[]
}

export function RolesTab({ tenantId, tenantName, roles }: RolesTabProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = React.useState(false)
  const [editRole, setEditRole] = React.useState<TenantRole | null>(null)
  const [deleteRole, setDeleteRole] = React.useState<TenantRole | null>(null)
  const [busyRoleId, setBusyRoleId] = React.useState<string | null>(null)

  const existingRoleNames = roles.map((r) => r.name)

  function openCreate() {
    setEditRole(null)
    setFormOpen(true)
  }

  function openEdit(role: TenantRole) {
    setEditRole(role)
    setFormOpen(true)
  }

  async function confirmDelete() {
    if (!deleteRole) return
    const role = deleteRole
    setDeleteRole(null)
    setBusyRoleId(role.id)
    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/roles/${role.id}`, {
        method: "DELETE",
      })
      if (!result.ok) {
        toast.error("Löschen fehlgeschlagen", { description: result.error })
        return
      }
      toast.success("Rolle gelöscht", { description: role.name })
      router.refresh()
    } finally {
      setBusyRoleId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {roles.length} Rolle{roles.length === 1 ? "" : "n"} in „{tenantName}“
        </p>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Neue Rolle
        </Button>
      </div>

      {roles.length === 0 ? (
        <EmptyState
          title="Noch keine Rollen in diesem Mandanten"
          description="Rollen bündeln Maskenrechte. Lege z. B. eine Rolle „Administrator“ mit Zugriff auf die Benutzerverwaltung an."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <caption className="sr-only">Rollen im Mandanten {tenantName}</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Masken</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wider sm:table-cell">
                  Benutzer
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => {
                const busy = busyRoleId === role.id
                const maskLabels = role.masks.map(getMaskLabel).join(", ")
                return (
                  <TableRow key={role.id} aria-busy={busy}>
                    <TableCell className="font-medium">
                      {role.name}
                      <div className="text-xs font-normal text-muted-foreground sm:hidden">
                        {role.userCount} Benutzer
                      </div>
                    </TableCell>
                    <TableCell>
                      <span title={maskLabels || undefined}>{role.masks.length}</span>
                      {maskLabels && (
                        <span className="ml-2 hidden text-xs text-muted-foreground lg:inline">
                          ({maskLabels})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{role.userCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => openEdit(role)}
                          aria-label={`Rolle ${role.name} bearbeiten`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => setDeleteRole(role)}
                          className="text-destructive hover:text-destructive"
                          aria-label={`Rolle ${role.name} löschen`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <RoleFormDialog
        tenantId={tenantId}
        tenantName={tenantName}
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editRole}
        existingRoleNames={existingRoleNames}
      />

      <AlertDialog open={deleteRole !== null} onOpenChange={(open) => !open && setDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Rolle „{deleteRole?.name}“ löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRole && deleteRole.userCount > 0
                ? `Die Rolle ist noch ${deleteRole.userCount} Benutzer${deleteRole.userCount === 1 ? "" : "n"} zugewiesen. Diese verlieren automatisch die damit verbundenen Maskenrechte, können sich aber weiterhin anmelden.`
                : "Die Rolle ist keinem Benutzer zugewiesen."}{" "}
              Das kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
