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

interface ArticleFiltersProps {
  articleTypes: { id: string; label: string }[]
}

const ALL = "alle"

/** Suche + Filter der Artikelliste; schreibt in die URL, die Liste lädt serverseitig neu. */
export function ArticleFilters({ articleTypes }: ArticleFiltersProps) {
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

  return (
    <div
      className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_10rem]"
      aria-busy={isPending}
      role="search"
    >
      <div className="space-y-1.5">
        <Label htmlFor="article-search">Suche</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="article-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Artikelnummer, Matchcode oder Bezeichnung"
            className="bg-card pl-9"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="article-filter-type">Artikeltyp</Label>
        <Select
          value={searchParams.get("typ") ?? ALL}
          onValueChange={(value) => update({ typ: value })}
        >
          <SelectTrigger id="article-filter-type" className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Typen</SelectItem>
            {articleTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="article-filter-status">Status</Label>
        <Select
          value={searchParams.get("status") ?? ALL}
          onValueChange={(value) => update({ status: value })}
        >
          <SelectTrigger id="article-filter-status" className="bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle</SelectItem>
            <SelectItem value="aktiv">Aktiv</SelectItem>
            <SelectItem value="inaktiv">Inaktiv</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
