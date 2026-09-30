"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TenantSelectorProps {
  tenants: { id: string; name: string }[]
  selectedTenantId: string
}

export function TenantSelector({ tenants, selectedTenantId }: TenantSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = React.useTransition()

  function handleChange(tenantId: string) {
    startTransition(() => {
      router.push(`${pathname}?mandant=${encodeURIComponent(tenantId)}`)
    })
  }

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-72">
      <Label htmlFor="tenant-selector">Mandant</Label>
      <Select value={selectedTenantId} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger id="tenant-selector" aria-busy={isPending}>
          <SelectValue placeholder="Mandant wählen" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
