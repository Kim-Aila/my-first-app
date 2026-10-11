"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { STOCK_TABS, type StockTabId } from "@/lib/stock"

/**
 * Reiterleiste der Lagerbestand-Maske. Der aktive Reiter steht in der URL (`reiter`), der Inhalt
 * wird serverseitig geladen; beim Wechsel bleiben nur Mandant und Reiter erhalten (Filter werden zurückgesetzt).
 */
export function StockTabsNav({
  active,
  tabs,
  reviewCount,
}: {
  active: StockTabId
  tabs: StockTabId[]
  /** Anzahl der Positionen "Fehlt, ungeprüft" (Zähler am Reiter "Prüfliste"). */
  reviewCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function select(next: string) {
    const params = new URLSearchParams()
    const tenant = searchParams.get("mandant")
    if (tenant) params.set("mandant", tenant)
    if (next !== "bestand") params.set("reiter", next)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <Tabs value={active} onValueChange={select} className="mb-4">
      <TabsList
        aria-label="Bereiche des Lagerbestands"
        className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
      >
        {STOCK_TABS.filter((tab) => tabs.includes(tab.id)).map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="border border-transparent data-[state=active]:border-border data-[state=active]:bg-card"
          >
            {tab.title}
            {tab.id === "pruefliste" && reviewCount > 0 && (
              <>
                <Badge
                  variant="secondary"
                  className="ml-2 bg-[#F8DDD3] px-1.5 text-[#8A2A0F] hover:bg-[#F8DDD3]"
                  aria-hidden="true"
                >
                  {reviewCount}
                </Badge>
                <span className="sr-only"> ({reviewCount} offen)</span>
              </>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
