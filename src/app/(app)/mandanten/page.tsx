import type { Metadata } from "next"
import { Pencil, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TenantFormDialog } from "@/components/mandanten/tenant-form-dialog"
import { PageHeader } from "@/components/page-header"
import { EmptyState, LoadErrorAlert, NoAccessCard } from "@/components/state-messages"
import { getSessionContext } from "@/lib/session-context"
import { createClient as createServerClient } from "@/lib/supabase-server"

export const metadata: Metadata = { title: "Mandanten · Manufaktur-ERP" }

interface TenantRow {
  id: string
  name: string
  created_at: string
  user_tenant_access: { count: number }[] | null
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "–"
    : date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export default async function MandantenPage() {
  const session = await getSessionContext()

  if (!session.isSuperAdmin) {
    return (
      <NoAccessCard description="Die Mandantenverwaltung steht nur Super-Admins zur Verfügung." />
    )
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, created_at, user_tenant_access(count)")
    .order("name", { ascending: true })

  const tenants = (data ?? []) as unknown as TenantRow[]
  const existingNames = tenants.map((t) => t.name)

  const newTenantButton = (
    <Button>
      <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
      Neuer Mandant
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Mandanten"
        description="Firmenzweige anlegen und umbenennen. Mandanten können in dieser Version nicht gelöscht werden."
        actions={<TenantFormDialog existingNames={existingNames} trigger={newTenantButton} />}
      />

      {error ? (
        <LoadErrorAlert />
      ) : tenants.length === 0 ? (
        <EmptyState
          title="Noch keine Mandanten"
          description="Lege den ersten Mandanten an, um Firmenzweige abzubilden."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <caption className="sr-only">Liste aller Mandanten</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wider sm:table-cell">
                    Benutzer
                  </TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wider md:table-cell">
                    Angelegt am
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {tenant.user_tenant_access?.[0]?.count ?? 0}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDate(tenant.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <TenantFormDialog
                        tenant={{ id: tenant.id, name: tenant.name }}
                        existingNames={existingNames}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Mandant ${tenant.name} umbenennen`}
                          >
                            <Pencil className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                            <span className="hidden sm:inline">Umbenennen</span>
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
