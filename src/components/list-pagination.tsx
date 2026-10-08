import Link from "next/link"

import { Button } from "@/components/ui/button"

/** Seitenwechsel für serverseitig paginierte Listen; `hrefFor(seite)` baut die Ziel-URL. */
export function ListPagination({
  page,
  pageSize,
  total,
  noun,
  hrefFor,
}: {
  page: number
  pageSize: number
  total: number
  /** Plural, z. B. "Adressen". */
  noun: string
  hrefFor: (page: number) => string
}) {
  if (total <= pageSize) return null
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav aria-label="Seitenwechsel" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Seite {page} von {pageCount} · {total} {noun}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          {page <= 1 ? (
            <span aria-disabled="true">Zurück</span>
          ) : (
            <Link href={hrefFor(page - 1)} rel="prev">
              Zurück
            </Link>
          )}
        </Button>
        <Button asChild variant="outline" size="sm" disabled={page >= pageCount}>
          {page >= pageCount ? (
            <span aria-disabled="true">Weiter</span>
          ) : (
            <Link href={hrefFor(page + 1)} rel="next">
              Weiter
            </Link>
          )}
        </Button>
      </div>
    </nav>
  )
}
