"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MoreHorizontal, ShieldCheck, UserMinus } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CreateUserDialog } from "@/components/benutzerverwaltung/create-user-dialog"
import { EditUserRolesDialog } from "@/components/benutzerverwaltung/edit-user-roles-dialog"
import type { TenantRole, TenantUser } from "@/components/benutzerverwaltung/types"
import { EmptyState } from "@/components/state-messages"
import { StatusBadge } from "@/components/status-badge"
import { apiRequest } from "@/lib/api-client"

interface UsersTabProps {
  tenantId: string
  tenantName: string
  users: TenantUser[]
  roles: TenantRole[]
  currentUserId: string
}

export function UsersTab({ tenantId, tenantName, users, roles, currentUserId }: UsersTabProps) {
  const router = useRouter()
  const [editUser, setEditUser] = React.useState<TenantUser | null>(null)
  const [removeUser, setRemoveUser] = React.useState<TenantUser | null>(null)
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null)

  const roleNameById = React.useMemo(
    () => new Map(roles.map((role) => [role.id, role.name])),
    [roles]
  )

  async function confirmRemove() {
    if (!removeUser) return
    const user = removeUser
    setRemoveUser(null)
    setBusyUserId(user.id)
    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/users/${user.id}`, {
        method: "DELETE",
      })
      if (!result.ok) {
        toast.error("Entfernen fehlgeschlagen", { description: result.error })
        return
      }
      toast.success("Benutzer entfernt", {
        description: `${user.username} hat keinen Zugriff mehr auf „${tenantName}“.`,
      })
      router.refresh()
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} Benutzer in „{tenantName}“
        </p>
        <CreateUserDialog tenantId={tenantId} tenantName={tenantName} roles={roles} />
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="Noch keine Benutzer in diesem Mandanten"
          description="Lege den ersten Benutzer an und weise ihm eine Rolle zu, z. B. „Administrator“ mit Zugriff auf die Benutzerverwaltung."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <caption className="sr-only">Benutzer im Mandanten {tenantName}</caption>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs uppercase tracking-wider">Benutzername</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wider md:table-cell">
                  Rollen
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const roleNames = user.roleIds
                  .map((id) => roleNameById.get(id))
                  .filter((name): name is string => Boolean(name))
                  .sort((a, b) => a.localeCompare(b, "de"))
                const busy = busyUserId === user.id
                const rolesContent =
                  roleNames.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {roleNames.map((name) => (
                        <Badge key={name} variant="outline" className="font-normal">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Keine Rolle</span>
                  )

                return (
                  <TableRow key={user.id} aria-busy={busy}>
                    <TableCell>
                      <div className="font-medium">
                        {user.username}
                        {user.id === currentUserId && (
                          <span className="ml-1 text-xs text-muted-foreground">(du)</span>
                        )}
                      </div>
                      <div className="break-all text-xs text-muted-foreground">{user.email}</div>
                      <div className="mt-2 md:hidden">{rolesContent}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{rolesContent}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.isActive ? (
                          <StatusBadge tone="positive">Aktiv</StatusBadge>
                        ) : (
                          <StatusBadge tone="blocked">Deaktiviert</StatusBadge>
                        )}
                        {user.isLocked && <StatusBadge tone="pending">Gesperrt</StatusBadge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* modal={false}: vermeidet hängendes pointer-events:none beim Öffnen eines Dialogs aus dem Menü */}
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy}
                            aria-label={`Aktionen für ${user.username}`}
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditUser(user)}>
                            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                            Rollen bearbeiten
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setRemoveUser(user)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserMinus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Aus diesem Mandanten entfernen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <EditUserRolesDialog
        tenantId={tenantId}
        user={editUser}
        roles={roles}
        onOpenChange={(open) => !open && setEditUser(null)}
      />

      <AlertDialog open={removeUser !== null} onOpenChange={(open) => !open && setRemoveUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Aus diesem Mandanten entfernen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeUser?.id === currentUserId
                ? `Du entfernst dich selbst aus „${tenantName}“ und verlierst sofort den Zugriff auf diesen Mandanten.`
                : `${removeUser?.username ?? ""} verliert den Zugriff auf „${tenantName}“ inklusive aller Rollen dort.`}{" "}
              Zugänge zu anderen Mandanten und das Benutzerkonto selbst bleiben unverändert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
