"use client"

import * as React from "react"
import Link from "next/link"
import { Check, ChevronsUpDown, ExternalLink, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { FormLabel } from "@/components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { apiGet } from "@/lib/api-client"
import { addressLabel, type AddressOption } from "@/lib/addresses"
import { cn } from "@/lib/utils"

const SEARCH_DELAY_MS = 250

/**
 * Feldbezeichnung eines Adress-Verweises: Klick öffnet die gewählte Adresse (sonst die Adressliste)
 * in einem neuen Tab, damit Eingaben und Bearbeitungssperre erhalten bleiben.
 */
export function AddressFieldLabel({
  tenantId,
  selectedId,
  canOpen,
  required,
  children,
}: {
  tenantId: string
  selectedId: string
  canOpen: boolean
  required?: boolean
  children: React.ReactNode
}) {
  const href = selectedId
    ? `/adressen/${selectedId}?mandant=${encodeURIComponent(tenantId)}`
    : `/adressen?mandant=${encodeURIComponent(tenantId)}`
  return (
    <FormLabel>
      {canOpen ? (
        <Link
          href={href}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-primary"
          title={selectedId ? "Adresse öffnen (neuer Tab)" : "Adressen öffnen (neuer Tab)"}
        >
          {children}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">– Adresse öffnen (neuer Tab)</span>
        </Link>
      ) : (
        children
      )}
      {required && <span aria-hidden="true"> *</span>}
    </FormLabel>
  )
}

interface AddressSelectProps {
  /** Von `FormControl` gesetzt (id, aria-*); nicht überschreiben. */
  id?: string
  tenantId: string
  /** Gewählte Adresse-ID ("" = keine). */
  value: string
  /** Kurzdaten der gewählten Adresse (auch wenn inaktiv) für die Anzeige im Feld. */
  selected: AddressOption | null
  onChange: (option: AddressOption | null) => void
  disabled?: boolean
  /** Nur Adressen mit gepflegtem Kürzel anbieten (Markeninhaber). */
  requireCode?: boolean
  /** Diese Adresse und alle ihre untergeordneten ausblenden (Zyklusschutz bei "Übergeordnete Adresse"). */
  excludeSubtreeOf?: string
  /** Hinweistext, wenn es überhaupt keine passende Adresse gibt. */
  emptyText?: string
  /** User darf die Adressmaske öffnen (für den Anlegen-Link im Leerhinweis). */
  canOpenAddresses: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/**
 * Suchbares Auswahlfeld für Adressen. Anders als die Merkmal-Auswahl lädt es die Treffer beim
 * Tippen serverseitig (mehrere tausend Adressen pro Mandant). Angeboten werden nur aktive Adressen;
 * ein bereits gesetzter Verweis auf eine inaktive Adresse bleibt sichtbar ("inaktiv").
 */
export function AddressSelect({
  id,
  tenantId,
  value,
  selected,
  onChange,
  disabled,
  requireCode,
  excludeSubtreeOf,
  emptyText = "Noch keine Adresse vorhanden –",
  canOpenAddresses,
  ...aria
}: AddressSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [items, setItems] = React.useState<AddressOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const loadedRef = React.useRef(false)

  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(
      async () => {
        setLoading(true)
        setError(null)
        const params = new URLSearchParams()
        if (query.trim()) params.set("q", query.trim())
        if (requireCode) params.set("requireCode", "true")
        if (excludeSubtreeOf) params.set("excludeSubtreeOf", excludeSubtreeOf)
        try {
          const result = await apiGet<{ items: AddressOption[] }>(
            `/api/tenants/${tenantId}/addresses/options?${params}`,
            controller.signal
          )
          if (controller.signal.aborted) return
          if (result.ok) {
            setItems(result.data.items ?? [])
            loadedRef.current = true
            setLoaded(true)
          } else {
            setItems([])
            setError(result.error)
          }
        } catch {
          return // abgebrochen
        }
        setLoading(false)
      },
      // Beim Öffnen sofort laden, beim Tippen kurz warten.
      loadedRef.current ? SEARCH_DELAY_MS : 0
    )
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [open, query, requireCode, excludeSubtreeOf, tenantId])

  const selectedText = selected
    ? `${addressLabel(selected)}${selected.isActive ? "" : " (inaktiv)"}`
    : value
      ? "Unbekannte Adresse"
      : ""
  const noneAtAll = loaded && !loading && !error && query.trim() === "" && items.length === 0

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between bg-card font-normal disabled:opacity-100 disabled:bg-muted/40",
            !selectedText && "text-muted-foreground"
          )}
          {...aria}
        >
          <span className="truncate">{selectedText || (disabled ? "–" : "Bitte wählen")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        {noneAtAll ? (
          <div className="space-y-2 p-4 text-sm">
            <p className="text-muted-foreground">{emptyText}</p>
            {canOpenAddresses ? (
              <Link
                href={`/adressen/neu?mandant=${encodeURIComponent(tenantId)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
              >
                hier anlegen (Adressen)
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : (
              <p className="text-muted-foreground">
                Dir fehlt das Recht, Adressen anzulegen. Wende dich an deinen Administrator.
              </p>
            )}
          </div>
        ) : (
          // Die Treffer filtert der Server; cmdk soll nicht zusätzlich filtern.
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Nummer, Name oder Kürzel suchen …"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading && (
                <div
                  role="status"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Suche läuft …
                </div>
              )}
              {error && (
                <p role="alert" className="px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
              {!loading && !error && <CommandEmpty>Keine Treffer.</CommandEmpty>}
              <CommandGroup>
                {value !== "" && (
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null)
                      setOpen(false)
                    }}
                    className="text-muted-foreground"
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" aria-hidden="true" />
                    Keine Auswahl
                  </CommandItem>
                )}
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onChange(item)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")}
                      aria-hidden="true"
                    />
                    <span className="truncate">{addressLabel(item)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
