"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/status-badge"
import { apiRequest } from "@/lib/api-client"

export interface GlobalUser {
  id: string
  username: string
  email: string
  isSuperAdmin: boolean
  isActive: boolean
  isLocked: boolean
  tenantNames: string[]
}

type PendingAction =
  | { type: "super-admin"; user: GlobalUser; next: boolean }
  | { type: "active"; user: GlobalUser; next: boolean }

const LAST_SUPER_ADMIN_MESSAGE =
  "Mindestens ein Super-Admin muss bestehen bleiben. Ernenne zuerst einen weiteren Super-Admin."

export function GlobalUsersTable({
  users,
  currentUserId,
}: {
  users: GlobalUser[]
  currentUserId: string
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState<PendingAction | null>(null)
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null)

  const superAdminCount = users.filter((u) => u.isSuperAdmin).length

  function requestSuperAdminChange(user: GlobalUser, next: boolean) {
    // Freundliche Vorab-Prüfung im Client; verbindlich prüft der Server (Spec-AC "letzter Super-Admin").
    if (!next && user.isSuperAdmin && superAdminCount <= 1) {
      toast.error("Aktion nicht möglich", { description: LAST_SUPER_ADMIN_MESSAGE })
      return
    }
    setPending({ type: "super-admin", user, next })
  }

  async function confirmPending() {
    if (!pending) return
    const { user, next, type } = pending
    setPending(null)
    setBusyUserId(user.id)

    try {
      const result = await apiRequest(`/api/users/${user.id}`, {
        method: "PATCH",
        body: type === "super-admin" ? { isSuperAdmin: next } : { isActive: next },
      })

      if (!result.ok) {
        toast.error("Änderung fehlgeschlagen", { description: result.error })
        return
      }

      toast.success(
        type === "super-admin"
          ? next
            ? `${user.username} ist jetzt Super-Admin`
            : `${user.username} ist kein Super-Admin mehr`
          : next
            ? `${user.username} wurde aktiviert`
            : `${user.username} wurde global deaktiviert`
      )
      router.refresh()
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <>
      <Table>
        <caption className="sr-only">Alle Benutzer im System</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wider">Benutzer</TableHead>
            <TableHead className="hidden text-xs uppercase tracking-wider lg:table-cell">
              Mandanten
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Super-Admin</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider">
              <span className="sr-only">Aktionen</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            const busy = busyUserId === user.id
            const switchId = `super-admin-${user.id}`
            return (
              <TableRow key={user.id} aria-busy={busy}>
                <TableCell>
                  <div className="font-medium">
                    {user.username}
                    {isSelf && <span className="ml-1 text-xs text-muted-foreground">(du)</span>}
                  </div>
                  <div className="break-all text-xs text-muted-foreground">{user.email}</div>
                  <div className="mt-1 text-xs text-muted-foreground lg:hidden">
                    {user.tenantNames.length > 0 ? user.tenantNames.join(", ") : "Kein Mandant"}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm lg:table-cell">
                  {user.tenantNames.length > 0 ? (
                    user.tenantNames.join(", ")
                  ) : (
                    <span className="text-muted-foreground">Kein Mandant</span>
                  )}
                </TableCell>
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
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={switchId}
                      checked={user.isSuperAdmin}
                      disabled={busy}
                      onCheckedChange={(checked) => requestSuperAdminChange(user, checked)}
                      aria-label={`Super-Admin-Recht für ${user.username}`}
                    />
                    <label htmlFor={switchId} className="sr-only sm:not-sr-only sm:text-sm">
                      {user.isSuperAdmin ? "Ja" : "Nein"}
                    </label>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={user.isActive ? "outline" : "default"}
                    size="sm"
                    disabled={busy || (isSelf && user.isActive)}
                    title={isSelf && user.isActive ? "Du kannst dich nicht selbst deaktivieren" : undefined}
                    onClick={() => setPending({ type: "active", user, next: !user.isActive })}
                    aria-label={`${user.username} global ${user.isActive ? "deaktivieren" : "aktivieren"}`}
                  >
                    {busy ? "…" : user.isActive ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-xl font-medium">
                  {pending.type === "super-admin"
                    ? pending.next
                      ? "Super-Admin-Recht vergeben?"
                      : "Super-Admin-Recht entziehen?"
                    : pending.next
                      ? "Benutzer aktivieren?"
                      : "Benutzer global deaktivieren?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pending.type === "super-admin"
                    ? pending.next
                      ? `${pending.user.username} erhält uneingeschränkten, mandantenübergreifenden Zugriff auf alle Daten und Verwaltungsbereiche.`
                      : `${pending.user.username} verliert den mandantenübergreifenden Zugriff und behält nur die Rechte aus seinen Rollen.`
                    : pending.next
                      ? `${pending.user.username} kann sich danach wieder in seinen Mandanten anmelden.`
                      : `${pending.user.username} kann sich danach in keinem Mandanten mehr anmelden — unabhängig von seinen Rollen. Die Mandanten-Zuordnungen bleiben erhalten.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmPending}
                  className={
                    (pending.type === "active" && !pending.next) ||
                    (pending.type === "super-admin" && !pending.next)
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : undefined
                  }
                >
                  {pending.type === "super-admin"
                    ? pending.next
                      ? "Recht vergeben"
                      : "Recht entziehen"
                    : pending.next
                      ? "Aktivieren"
                      : "Deaktivieren"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
