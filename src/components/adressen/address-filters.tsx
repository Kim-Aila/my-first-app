"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ADDRESS_ROLES } from "@/lib/addresses"

interface AddressFiltersProps {
  countries: { id: string; label: string }[]
}

const ALL = "alle"

/**
 * Suche + Filter der Adressliste; schreibt in die URL, die Liste lädt serverseitig neu.
 * Status: ohne Angabe = nur Aktive (Standard laut Spec); "alle" und "inaktiv" stehen explizit in der URL.
 */
export function AddressFilters({ countries }: AddressFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = React.useTransition()
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "")

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "" || (value === ALL && key !== "status")) params.delete(key)
        else if (key === "status" && value === "aktiv") params.delete(key)
        else params.set(key, value)
      }
      params.delete("seite")
      startTransition(() => {
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname)
      })
    },
    [pathname, router, searchParams]
  )

  // Suche mit kurzer Verzögerung, damit nicht jeder Tastendruck die Liste neu lädt.
  React.useEffect(() => {
    if (query === (searchParams.get("q") ?? "")) return
    const timer = window.setTimeout(() => update({ q: query.trim() }), 300)
    return () => window.clearTimeout(timer)
  }, [query, searchParams, update])

  return (
    <div
      className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_12rem_9rem]"
      aria-busy={isPending}
      role="search"
    >
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="address-search">Suche</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="address-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nummer, Name, Kürzel, GLN, Ort oder PLZ"
            className="bg-card pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address-filter-role">Rolle</Label>
        <Select
          value={searchParams.get("rolle") ?? ALL}
          onValueChange={(value) => update({ rolle: value })}
        >
          <SelectTrigger id="address-filter-role" className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Rollen</SelectItem>
            {ADDRESS_ROLES.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address-filter-country">Land</Label>
        <Select
          value={searchParams.get("land") ?? ALL}
          onValueChange={(value) => update({ land: value })}
        >
          <SelectTrigger id="address-filter-country" className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Länder</SelectItem>
            {countries.map((country) => (
              <SelectItem key={country.id} value={country.id}>
                {country.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address-filter-status">Status</Label>
        <Select
          value={searchParams.get("status") ?? "aktiv"}
          onValueChange={(value) => update({ status: value })}
        >
          <SelectTrigger id="address-filter-status" className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="aktiv">Aktiv</SelectItem>
            <SelectItem value="inaktiv">Inaktiv</SelectItem>
            <SelectItem value={ALL}>Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
