"use client"

import * as React from "react"
import Link from "next/link"
import { Check, ChevronsUpDown, ExternalLink } from "lucide-react"

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
import { merkmalHref, merkmalLabel, type MerkmalConfig, type MerkmalItem } from "@/lib/merkmale"
import { cn } from "@/lib/utils"

interface ReferenceSelectProps {
  /** Von `FormControl` gesetzt (id, aria-*), damit die Beschriftung das Feld benennt; nicht überschreiben. */
  id?: string
  config: MerkmalConfig
  items: MerkmalItem[]
  value: string
  onChange: (value: string) => void
  tenantId: string
  required?: boolean
  disabled?: boolean
  /** User darf die Pflege-Maske öffnen (sonst keine Verlinkung). */
  canOpenMaintenance: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

/** Feldbezeichnung eines Auswahlfelds mit Tabellenbezug: Klick öffnet die Pflege-Maske. */
export function ReferenceLabel({
  config,
  tenantId,
  canOpenMaintenance,
  required,
  children,
}: {
  config: MerkmalConfig
  tenantId: string
  canOpenMaintenance: boolean
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <FormLabel>
      {canOpenMaintenance ? (
        <Link
          href={merkmalHref(config, tenantId)}
          // Neuer Tab: ungespeicherte Eingaben und die Bearbeitungssperre bleiben erhalten.
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-4 hover:text-primary"
          title={`${config.plural} pflegen (öffnet in neuem Tab)`}
        >
          {children}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">– {config.plural} pflegen (neuer Tab)</span>
        </Link>
      ) : (
        children
      )}
      {required && <span aria-hidden="true"> *</span>}
    </FormLabel>
  )
}

export function ReferenceSelect({
  id,
  config,
  items,
  value,
  onChange,
  tenantId,
  required,
  disabled,
  canOpenMaintenance,
  ...aria
}: ReferenceSelectProps) {
  const [open, setOpen] = React.useState(false)

  // Inaktive Einträge erscheinen nicht in neuen Auswahlen, bleiben aber sichtbar, wenn der
  // Artikel sie bereits verwendet.
  const options = items.filter((item) => item.isActive || item.id === value)
  const selected = items.find((item) => item.id === value)
  const selectedText = selected
    ? `${merkmalLabel(config, selected)}${selected.isActive ? "" : " (inaktiv)"}`
    : value
      ? "Unbekannter Eintrag"
      : ""
  const isEmpty = options.length === 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        {isEmpty ? (
          <div className="space-y-2 p-4 text-sm">
            <p className="text-muted-foreground">Noch keine Einträge –</p>
            {canOpenMaintenance ? (
              <Link
                href={merkmalHref(config, tenantId)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4"
              >
                hier anlegen ({config.plural})
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : (
              <p className="text-muted-foreground">
                Dir fehlt das Recht, {config.plural} anzulegen. Wende dich an deinen Administrator.
              </p>
            )}
          </div>
        ) : (
          <Command>
            <CommandInput placeholder={`${config.singular} suchen …`} />
            <CommandList>
              <CommandEmpty>Keine Treffer.</CommandEmpty>
              <CommandGroup>
                {!required && (
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange("")
                      setOpen(false)
                    }}
                    className="text-muted-foreground"
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === "" ? "opacity-100" : "opacity-0")}
                      aria-hidden="true"
                    />
                    Keine Auswahl
                  </CommandItem>
                )}
                {options.map((item) => {
                  const text = merkmalLabel(config, item)
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${text} ${item.id}`}
                      onSelect={() => {
                        onChange(item.id)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === item.id ? "opacity-100" : "opacity-0"
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {text}
                        {item.isActive ? "" : " (inaktiv)"}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
