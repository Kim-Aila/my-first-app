"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { STOCK_STATUSES } from "@/lib/stock"

const ALL = "alle"

/**
 * Suche + Filter für "Bestand je Artikel" (`kind="article"`) und "LHM-Liste" (`kind="lhm"`);
 * schreibt in die URL, die Liste lädt serverseitig neu.
 */
export function StockFilters({ kind }: { kind: "article" | "lhm" }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = React.useTransition()
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "")

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "" || value === ALL) params.delete(key)
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

  const checkboxId = kind === "article" ? "stock-filter-unknown" : "stock-filter-mixed"
  const checkboxParam = kind === "article" ? "unbekannt" : "mischpalette"

  return (
    <div
      className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_auto]"
      aria-busy={isPending}
      role="search"
    >
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="stock-search">Suche</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="stock-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "article" ? "Artikelnummer oder Bezeichnung" : "SSCC oder Artikelnummer"}
            className="bg-card pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      {kind === "lhm" && (
        <div className="space-y-1.5">
          <Label htmlFor="stock-filter-status">Status</Label>
          <Select
            value={searchParams.get("status") ?? ALL}
            onValueChange={(value) => update({ status: value })}
          >
            <SelectTrigger id="stock-filter-status" className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Status</SelectItem>
              {STOCK_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-end gap-2 pb-2">
        <Checkbox
          id={checkboxId}
          checked={searchParams.get(checkboxParam) === "1"}
          onCheckedChange={(checked) => update({ [checkboxParam]: checked === true ? "1" : null })}
        />
        <Label htmlFor={checkboxId} className="cursor-pointer font-normal">
          {kind === "article" ? "Nur Artikel nicht im Stamm" : "Nur Mischpaletten"}
        </Label>
      </div>
    </div>
  )
}
