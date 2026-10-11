import Link from "next/link"

import { LoadErrorAlert } from "@/components/state-messages"
import { formatQuantity, type ArticleStockValues } from "@/lib/stock"

export type ArticleStockState =
  | { state: "ok"; values: ArticleStockValues | null }
  | { state: "error" }

const ITEMS: { key: keyof ArticleStockValues; label: string }[] = [
  { key: "stock", label: "Bestand" },
  { key: "qsBlocked", label: "Gesperrt QS" },
  { key: "blocked", label: "Gesperrt" },
  { key: "blockedTotal", label: "Gesperrt gesamt" },
  { key: "available", label: "Verfügbar" },
]

/** Reiter "Bestand" der Artikelmaske: die fünf Lagerwerte, schreibgeschützt. */
export function ArticleStockPanel({
  stock,
  articleNumber,
  tenantId,
}: {
  stock: ArticleStockState
  articleNumber: string
  tenantId: string
}) {
  if (stock.state === "error") {
    return <LoadErrorAlert title="Bestand konnte nicht geladen werden" />
  }
  const values = stock.values
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Summe aller LHM-Positionen im Status „Im Lager“ für Artikel {articleNumber}. Die Werte sind
        schreibgeschützt und kommen aus dem Lagerimport.
      </p>
      {!values && (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Zu diesem Artikel gibt es derzeit keinen Lagerbestand.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ITEMS.map(({ key, label }) => (
          <div key={key} className="rounded-[18px] border bg-background p-4">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-display text-2xl font-medium tabular-nums">
              {formatQuantity(values?.[key] ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/lagerbestand?mandant=${encodeURIComponent(tenantId)}&reiter=lhm&q=${encodeURIComponent(articleNumber)}`}
        className="inline-block text-sm underline underline-offset-4 hover:text-primary"
      >
        LHM-Positionen dieses Artikels ansehen
      </Link>
    </div>
  )
}
