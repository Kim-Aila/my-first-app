"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, type FieldErrors, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Info, Pencil, Power } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AddressContactsTab } from "@/components/adressen/address-contacts-tab"
import { AddressFieldLabel, AddressSelect } from "@/components/adressen/address-select"
import { EditLockBanner } from "@/components/edit-lock/edit-lock-banner"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useUnsavedChangesEntry } from "@/components/unsaved-changes-provider"
import {
  ComputedField,
  TextAreaField,
  TextField,
} from "@/components/warenwirtschaft/form-fields"
import { ReferenceLabel, ReferenceSelect } from "@/components/warenwirtschaft/reference-select"
import { useEditLock } from "@/hooks/use-edit-lock"
import { apiGet, apiRequest } from "@/lib/api-client"
import {
  ADDRESS_LOCK_RESOURCE,
  ADDRESS_ROLES,
  EMPTY_ADDRESS_VALUES,
  addressFormSchema,
  addressLabel,
  addressRoleLabel,
  computeAddressNumber,
  toAddressPayload,
  type Address,
  type AddressFormValues,
  type AddressOption,
} from "@/lib/addresses"
import type { LockHolder } from "@/lib/edit-lock"
import { getMerkmalConfig, type MerkmalItem } from "@/lib/merkmale"

// Reiter der Adressmaske; `fields` ordnet jedes Formularfeld seinem Reiter zu (Fehlermarkierung).
const TABS = [
  {
    id: "stammdaten",
    title: "Stammdaten",
    fields: ["addressBase", "suffix", "name", "nameAddition", "code", "gln", "roles"],
  },
  {
    id: "anschrift",
    title: "Anschrift & Erreichbarkeit",
    fields: [
      "street",
      "houseNumber",
      "postalCode",
      "city",
      "countryId",
      "phone",
      "email",
      "website",
    ],
  },
  { id: "kontakt", title: "Kontakt", fields: [] },
  {
    id: "verknuepfungen",
    title: "Verknüpfungen",
    fields: ["parentAddressId", "invoiceRecipientId", "invoiceShipToId", "billingCompanyId"],
  },
  { id: "steuer", title: "Steuer & Bemerkung", fields: ["vatId", "remark"] },
] as const

type TabId = (typeof TABS)[number]["id"]

function tabsWithErrors(errors: FieldErrors<AddressFormValues>): TabId[] {
  return TABS.filter((tab) =>
    (tab.fields as readonly string[]).some((field) => field in errors)
  ).map((tab) => tab.id)
}

function tabOfField(field: string): TabId | undefined {
  return TABS.find((tab) => (tab.fields as readonly string[]).includes(field))?.id
}

type AddressRefField =
  | "parentAddressId"
  | "invoiceRecipientId"
  | "invoiceShipToId"
  | "billingCompanyId"

const COUNTRY_CONFIG = getMerkmalConfig("laender")!

interface AddressFormProps {
  tenantId: string
  /** Ohne `address` wird eine neue Adresse angelegt. */
  address: Address | null
  /** Länder des Mandanten (aktive und inaktive). */
  countries: MerkmalItem[]
  /** Kurzdaten der verknüpften Adressen (Anzeige gewählter Verweise, auch inaktive). */
  refs: Record<string, AddressOption>
  /** Direkt untergeordnete Adressen (nur Anzeige). */
  childAddresses: AddressOption[]
  canWrite: boolean
  /** Zusatzrecht "aktivieren/deaktivieren" (nur mit Schreibrecht wirksam). */
  canToggleActive: boolean
  /** Leserecht auf die Maske "Kontakte" (sonst Reiter ausgeblendet). */
  canReadContacts: boolean
  canWriteContacts: boolean
  canOpenCountries: boolean
  /** Fremde Sperre, die beim Laden der Seite bereits bestand. */
  lockedBy: LockHolder | null
}

export function AddressForm({
  tenantId,
  address,
  countries,
  refs,
  childAddresses,
  canWrite,
  canToggleActive,
  canReadContacts,
  canWriteContacts,
  canOpenCountries,
  lockedBy,
}: AddressFormProps) {
  const router = useRouter()
  const isNew = address === null
  const [isEditing, setIsEditing] = React.useState(isNew)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<TabId>("stammdaten")
  const [discardOpen, setDiscardOpen] = React.useState(false)
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)
  // Anzeigedaten gewählter Adress-Verweise (Startwert vom Server, ergänzt beim Auswählen).
  const [refCache, setRefCache] = React.useState<Record<string, AddressOption>>(refs)

  const lock = useEditLock({
    tenantId,
    resourceType: ADDRESS_LOCK_RESOURCE,
    resourceId: address?.id ?? "new",
  })

  const initialValues = address?.values ?? EMPTY_ADDRESS_VALUES
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: initialValues,
  })
  const { isDirty, errors } = form.formState
  const errorTabs = tabsWithErrors(errors)

  const lockLost = lock.status === "lost"
  const fieldsDisabled = !isEditing || lockLost || saving
  const watched = form.watch()

  const previewNumber = computeAddressNumber(watched.addressBase, watched.suffix)
  const addressNumber = isEditing ? previewNumber : (address?.addressNumber ?? previewNumber)

  // ---- Vorschlag nächste freie Kennziffer -----------------------------------------------------
  const [suggestion, setSuggestion] = React.useState<string | null>(null)
  const suggestionBase = React.useRef<string>("")
  const baseValue = watched.addressBase.trim()
  React.useEffect(() => {
    if (!isEditing || !/^\d{1,10}$/.test(baseValue)) {
      setSuggestion(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      apiGet<{ suffix: string | null; exists: boolean }>(
        `/api/tenants/${tenantId}/addresses/next-suffix?base=${encodeURIComponent(baseValue)}`,
        controller.signal
      )
        .then((result) => {
          if (controller.signal.aborted) return
          const next = result.ok && result.data.exists ? result.data.suffix : null
          setSuggestion(next)
          // Gibt es die Basis schon und ist die Kennziffer noch leer, wird sie vorbelegt (änderbar).
          if (next && form.getValues("suffix") === "" && suggestionBase.current !== baseValue) {
            form.setValue("suffix", next, { shouldDirty: true })
          }
          suggestionBase.current = baseValue
        })
        .catch(() => undefined) // abgebrochen
    }, 300)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [baseValue, form, isEditing, tenantId])

  // ---- Kürzel-Duplikat (Hinweis, nicht blockierend) -------------------------------------------
  const [codeDuplicate, setCodeDuplicate] = React.useState<AddressOption[]>([])
  const checkCode = React.useCallback(
    async (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) {
        setCodeDuplicate([])
        return
      }
      const params = new URLSearchParams({ code: trimmed })
      if (address) params.set("excludeId", address.id)
      const result = await apiGet<{ items: AddressOption[] }>(
        `/api/tenants/${tenantId}/addresses/code-check?${params}`
      )
      setCodeDuplicate(result.ok ? (result.data.items ?? []) : [])
    },
    [address, tenantId]
  )

  // Prüfung mit kurzer Verzögerung nach der Eingabe (und beim Öffnen einer Adresse mit Kürzel).
  const codeValue = watched.code
  React.useEffect(() => {
    if (!isEditing) return
    const timer = window.setTimeout(() => void checkCode(codeValue), 400)
    return () => window.clearTimeout(timer)
  }, [checkCode, codeValue, isEditing])

  // Neue Länder in der Pflege-Maske (anderer Tab) sollen nach Rückkehr auswählbar sein.
  React.useEffect(() => {
    if (!isEditing) return
    const onFocus = () => router.refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [isEditing, router])

  // ---- Speichern ------------------------------------------------------------------------------
  const submit = React.useCallback(
    async (values: AddressFormValues, options: { navigate: boolean }): Promise<boolean> => {
      setFormError(null)
      setSaving(true)
      try {
        const body = toAddressPayload(values)
        const result = address
          ? await apiRequest(`/api/tenants/${tenantId}/addresses/${address.id}`, {
              method: "PATCH",
              body,
            })
          : await apiRequest<{ id?: string }>(`/api/tenants/${tenantId}/addresses`, {
              method: "POST",
              body,
            })

        if (!result.ok) {
          const duplicate =
            result.status === 409 && (!result.field || result.field === "addressNumber")
          if (duplicate && !/gesperrt|bearbeitet/i.test(result.error)) {
            form.setError("suffix", { message: result.error })
            setActiveTab("stammdaten")
          } else if (result.field && result.field in values) {
            form.setError(result.field as FieldPath<AddressFormValues>, { message: result.error })
            setActiveTab(tabOfField(result.field) ?? "stammdaten")
          } else {
            setFormError(result.error)
          }
          return false
        }

        toast.success(address ? "Adresse gespeichert" : "Adresse angelegt")
        form.reset(values)
        if (address) {
          await lock.release()
          setIsEditing(false)
          router.refresh()
        } else if (options.navigate) {
          const id = (result.data as { id?: string } | null)?.id
          router.push(
            id
              ? `/adressen/${id}?mandant=${encodeURIComponent(tenantId)}`
              : `/adressen?mandant=${encodeURIComponent(tenantId)}`
          )
        }
        return true
      } finally {
        setSaving(false)
      }
    },
    [address, form, lock, router, tenantId]
  )

  function onInvalid(fieldErrors: FieldErrors<AddressFormValues>) {
    const [firstTab] = tabsWithErrors(fieldErrors)
    if (firstTab) setActiveTab(firstTab)
  }

  const onSubmit = form.handleSubmit((values) => submit(values, { navigate: true }), onInvalid)

  // Logout-Abfrage: Speichern / Verwerfen für offene Änderungen.
  useUnsavedChangesEntry({
    isDirty: () => isEditing && isDirty,
    save: async () => {
      let ok = false
      await form.handleSubmit(async (values) => {
        ok = await submit(values, { navigate: false })
      }, onInvalid)()
      return ok
    },
    discard: async () => {
      if (!isNew) await lock.release()
    },
  })

  // ---- Bearbeiten / Abbrechen / Status --------------------------------------------------------
  async function startEditing() {
    const result = await lock.acquire()
    if (result.ok) {
      setFormError(null)
      setIsEditing(true)
    } else {
      toast.error("Bearbeiten nicht möglich", { description: result.message })
    }
  }

  async function reacquire() {
    const result = await lock.acquire()
    if (!result.ok) toast.error("Sperren nicht möglich", { description: result.message })
  }

  async function cancelEditing() {
    setDiscardOpen(false)
    setFormError(null)
    form.reset(initialValues)
    setCodeDuplicate([])
    if (isNew) {
      router.push(`/adressen?mandant=${encodeURIComponent(tenantId)}`)
      return
    }
    await lock.release()
    setIsEditing(false)
  }

  function requestCancel() {
    if (isDirty) setDiscardOpen(true)
    else void cancelEditing()
  }

  const hasChildren = childAddresses.length > 0
  const activeChildCount = childAddresses.filter((child) => child.isActive).length
  // Beim Deaktivieren zählen nur aktive Unteradressen, beim Reaktivieren alle (laut Spec).
  const askAboutChildren = address?.isActive ? activeChildCount > 0 : hasChildren

  async function changeStatus(includeChildren: boolean) {
    if (!address) return
    setStatusBusy(true)
    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/addresses/${address.id}/status`, {
        method: "PATCH",
        body: { isActive: !address.isActive, includeChildren },
      })
      if (!result.ok) {
        toast.error(address.isActive ? "Deaktivieren fehlgeschlagen" : "Aktivieren fehlgeschlagen", {
          description: result.error,
        })
        return
      }
      toast.success(address.isActive ? "Adresse deaktiviert" : "Adresse aktiviert", {
        description: includeChildren ? "Inklusive untergeordneter Adressen." : undefined,
      })
      setStatusOpen(false)
      router.refresh()
    } finally {
      setStatusBusy(false)
    }
  }

  // ---- Felder ---------------------------------------------------------------------------------
  function renderAddressRef(
    name: AddressRefField,
    label: string,
    options: { hint?: string; excludeSubtree?: boolean } = {}
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <AddressFieldLabel
              tenantId={tenantId}
              selectedId={field.value}
              canOpen
            >
              {label}
            </AddressFieldLabel>
            <FormControl>
              <AddressSelect
                tenantId={tenantId}
                value={field.value}
                selected={field.value ? (refCache[field.value] ?? null) : null}
                onChange={(option) => {
                  if (option) setRefCache((cache) => ({ ...cache, [option.id]: option }))
                  field.onChange(option?.id ?? "")
                }}
                excludeSubtreeOf={options.excludeSubtree ? address?.id : undefined}
                disabled={fieldsDisabled}
                canOpenAddresses
              />
            </FormControl>
            {options.hint && <FormDescription>{options.hint}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  const c = form.control
  const title = isNew ? "Neue Adresse" : address.addressNumber || "Adresse"
  const savedRoles = address?.values.roles ?? []
  const headerRoles = isEditing ? watched.roles : savedRoles
  const headerName = isEditing ? watched.name : (address?.values.name ?? "")
  const addressText = address ? `${address.addressNumber} – ${address.values.name}` : "dieser Adresse"
  const showContactsTab = canReadContacts
  const visibleTabs = TABS.filter((tab) => tab.id !== "kontakt" || showContactsTab)

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={`/adressen?mandant=${encodeURIComponent(tenantId)}`}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Zur Adressliste
          </Link>
        </Button>
      </div>

      <PageHeader
        title={title}
        description={
          isNew
            ? "Pflichtfelder sind Adressnummer-Basis, Kennziffer und Name."
            : headerName || "Ohne Namen"
        }
        actions={
          <>
            {headerRoles.map((role) => (
              <Badge key={role} variant="outline" className="font-normal">
                {addressRoleLabel(role)}
              </Badge>
            ))}
            {address && (
              <StatusBadge tone={address.isActive ? "positive" : "neutral"}>
                {address.isActive ? "Aktiv" : "Inaktiv"}
              </StatusBadge>
            )}
            {canWrite && !isEditing && address && (
              <>
                {canToggleActive && (
                  <Button
                    variant="outline"
                    onClick={() => setStatusOpen(true)}
                    disabled={lock.status === "acquiring"}
                  >
                    <Power className="mr-1 h-4 w-4" aria-hidden="true" />
                    {address.isActive ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                )}
                <Button onClick={startEditing} disabled={lock.status === "acquiring"}>
                  <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
                  {lock.status === "acquiring" ? "Wird gesperrt …" : "Bearbeiten"}
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button variant="outline" onClick={requestCancel} disabled={saving}>
                  Abbrechen
                </Button>
                <Button onClick={onSubmit} disabled={saving || lockLost}>
                  {saving ? "Wird gespeichert …" : "Speichern"}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {!isNew && (
          <EditLockBanner
            lock={lock}
            initialHolder={isEditing ? null : lockedBy}
            noun="Adresse"
            onReacquire={reacquire}
            reacquiring={lock.status === "acquiring"}
          />
        )}

        {!canWrite && !isNew && (
          <Alert>
            <AlertTitle>Nur Lesezugriff</AlertTitle>
            <AlertDescription>Du darfst Adressen ansehen, aber nicht bearbeiten.</AlertDescription>
          </Alert>
        )}

        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Speichern fehlgeschlagen</AlertTitle>
            <AlertDescription>{formError} Deine Eingaben bleiben erhalten.</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
              <TabsList className="mb-2 h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {visibleTabs.map((tab) => {
                  const hasError = errorTabs.includes(tab.id)
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="border border-transparent data-[state=active]:border-border data-[state=active]:bg-card"
                    >
                      {tab.title}
                      {hasError && (
                        <>
                          <span
                            aria-hidden="true"
                            className="ml-2 h-2 w-2 rounded-full bg-destructive"
                          />
                          <span className="sr-only"> (enthält Fehler)</span>
                        </>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              <Section id="stammdaten">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    control={c}
                    name="addressBase"
                    label="Adressnummer-Basis"
                    required
                    disabled={fieldsDisabled}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="bis zu 10 Ziffern, z. B. 4711"
                    hint="Nur Ziffern, höchstens 10 Stellen. Mehrere Adressen können dieselbe Basis haben."
                  />
                  <div className="space-y-2">
                    <TextField
                      control={c}
                      name="suffix"
                      label="Kennziffer"
                      required
                      disabled={fieldsDisabled}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="4 Ziffern, z. B. 0001"
                      hint="Genau 4 Ziffern."
                    />
                    {isEditing && suggestion && watched.suffix !== suggestion && (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Info className="h-4 w-4" aria-hidden="true" />
                        <span>
                          Basis {baseValue} existiert bereits – nächste freie Kennziffer:{" "}
                          <strong className="tabular-nums">{suggestion}</strong>
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => form.setValue("suffix", suggestion, { shouldDirty: true })}
                        >
                          Übernehmen
                        </Button>
                      </div>
                    )}
                  </div>
                  <ComputedField
                    id="address-number"
                    label="Adressnummer"
                    value={addressNumber}
                    hint="Basis + „.“ + Kennziffer, pro Mandant eindeutig."
                  />
                  <div className="space-y-2">
                    <TextField
                      control={c}
                      name="code"
                      label="Kürzel"
                      disabled={fieldsDisabled}
                      maxLength={10}
                      hint="Optional. Mit Kürzel kann die Adresse am Artikel als Markeninhaber gewählt werden."
                    />
                    {isEditing && codeDuplicate.length > 0 && (
                      <Alert role="status">
                        <Info className="h-4 w-4" aria-hidden="true" />
                        <AlertTitle>Kürzel wird bereits verwendet</AlertTitle>
                        <AlertDescription>
                          {codeDuplicate.map((d) => addressLabel(d) + (d.isActive ? "" : " (inaktiv)")).join("; ")}
                          . Du kannst trotzdem speichern.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <TextField
                      control={c}
                      name="name"
                      label="Name / Firma"
                      required
                      disabled={fieldsDisabled}
                      maxLength={200}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <TextField
                      control={c}
                      name="nameAddition"
                      label="Namenszusatz"
                      disabled={fieldsDisabled}
                      maxLength={200}
                    />
                  </div>
                  <TextField
                    control={c}
                    name="gln"
                    label="GLN"
                    disabled={fieldsDisabled}
                    inputMode="numeric"
                    maxLength={13}
                    hint="Optional; wenn angegeben genau 13 Ziffern."
                  />
                  <div className="md:col-span-2">
                    <FormField
                      control={c}
                      name="roles"
                      render={({ field }) => (
                        <FormItem>
                          <fieldset className="space-y-3">
                            <legend className="text-sm font-medium">Rollen</legend>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {ADDRESS_ROLES.map((role) => {
                                const checked = field.value.includes(role.value)
                                const id = `address-role-${role.value}`
                                return (
                                  <div
                                    key={role.value}
                                    className="flex items-center gap-3 rounded-md border bg-card p-3"
                                  >
                                    <Checkbox
                                      id={id}
                                      checked={checked}
                                      disabled={fieldsDisabled}
                                      className="disabled:opacity-100"
                                      onCheckedChange={(next) =>
                                        field.onChange(
                                          next === true
                                            ? [...field.value, role.value]
                                            : field.value.filter((r) => r !== role.value)
                                        )
                                      }
                                    />
                                    <FormLabel htmlFor={id} className="cursor-pointer font-normal">
                                      {role.label}
                                    </FormLabel>
                                  </div>
                                )
                              })}
                            </div>
                            <FormDescription>
                              Mehrfachauswahl möglich, z. B. Kunde und Lieferadresse.
                            </FormDescription>
                          </fieldset>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </Section>

              <Section id="anschrift">
                <div className="grid gap-4 md:grid-cols-6">
                  <div className="md:col-span-4">
                    <TextField control={c} name="street" label="Straße" disabled={fieldsDisabled} maxLength={200} />
                  </div>
                  <div className="md:col-span-2">
                    <TextField control={c} name="houseNumber" label="Hausnummer" disabled={fieldsDisabled} maxLength={20} />
                  </div>
                  <div className="md:col-span-2">
                    <TextField control={c} name="postalCode" label="PLZ" disabled={fieldsDisabled} maxLength={10} />
                  </div>
                  <div className="md:col-span-4">
                    <TextField control={c} name="city" label="Ort" disabled={fieldsDisabled} maxLength={100} />
                  </div>
                  <div className="md:col-span-3">
                    <FormField
                      control={c}
                      name="countryId"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <ReferenceLabel
                            config={COUNTRY_CONFIG}
                            tenantId={tenantId}
                            canOpenMaintenance={canOpenCountries}
                          >
                            {COUNTRY_CONFIG.singular}
                          </ReferenceLabel>
                          <FormControl>
                            <ReferenceSelect
                              config={COUNTRY_CONFIG}
                              items={countries}
                              value={field.value}
                              onChange={field.onChange}
                              tenantId={tenantId}
                              disabled={fieldsDisabled}
                              canOpenMaintenance={canOpenCountries}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="md:col-span-3" aria-hidden="true" />
                  <div className="md:col-span-2">
                    <TextField control={c} name="phone" label="Telefon" disabled={fieldsDisabled} maxLength={50} />
                  </div>
                  <div className="md:col-span-2">
                    <TextField control={c} name="email" label="E-Mail" disabled={fieldsDisabled} maxLength={254} />
                  </div>
                  <div className="md:col-span-2">
                    <TextField control={c} name="website" label="Webseite" disabled={fieldsDisabled} maxLength={200} />
                  </div>
                  <p className="text-sm text-muted-foreground md:col-span-6">
                    Telefon, E-Mail und Webseite sind allgemeine Angaben dieser Adresse (z. B. der
                    Zentrale). Personenbezogene Angaben gehören in den Reiter „Kontakt“.
                  </p>
                </div>
              </Section>

              {showContactsTab && (
                <Section id="kontakt">
                  <AddressContactsTab
                    tenantId={tenantId}
                    addressId={address?.id ?? null}
                    addressText={addressText}
                    canWrite={canWriteContacts}
                    parentChanged={
                      !isNew && watched.parentAddressId !== (address?.values.parentAddressId ?? "")
                    }
                  />
                </Section>
              )}

              <Section id="verknuepfungen">
                <div className="grid gap-4 md:grid-cols-2">
                  {renderAddressRef("parentAddressId", "Übergeordnete Adresse", {
                    excludeSubtree: true,
                    hint: "Höchstens eine, z. B. die Zentrale. Zyklen sind nicht erlaubt.",
                  })}
                  {renderAddressRef("invoiceRecipientId", "Rechnungsempfänger", {
                    hint: "Leer = die Adresse selbst.",
                  })}
                  {renderAddressRef("invoiceShipToId", "Rechnungsversand an", {
                    hint: "Leer = der Rechnungsempfänger.",
                  })}
                  {renderAddressRef("billingCompanyId", "Abrechnungsgesellschaft", {
                    hint: "Adresse, über die Konditionen und Abrechnung laufen.",
                  })}
                </div>

                <div className="mt-6 space-y-2">
                  <h2 className="text-sm font-medium">Untergeordnete Adressen</h2>
                  {isNew ? (
                    <p className="text-sm text-muted-foreground">
                      Wird nach dem ersten Speichern angezeigt.
                    </p>
                  ) : childAddresses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Dieser Adresse sind keine Adressen untergeordnet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border bg-card">
                      {childAddresses.map((child) => (
                        <li
                          key={child.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <Link
                            href={`/adressen/${child.id}?mandant=${encodeURIComponent(tenantId)}`}
                            className="truncate underline-offset-4 hover:text-primary hover:underline"
                          >
                            {addressLabel(child)}
                          </Link>
                          <StatusBadge tone={child.isActive ? "positive" : "neutral"}>
                            {child.isActive ? "Aktiv" : "Inaktiv"}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>

              <Section id="steuer">
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    control={c}
                    name="vatId"
                    label="USt-IdNr."
                    disabled={fieldsDisabled}
                    maxLength={15}
                    placeholder="z. B. DE123456789"
                    hint="Mit Länderpräfix, höchstens 15 Zeichen; wird nicht extern geprüft."
                  />
                  <div className="md:col-span-2">
                    <TextAreaField
                      control={c}
                      name="remark"
                      label="Bemerkung"
                      disabled={fieldsDisabled}
                      maxLength={2000}
                    />
                  </div>
                </div>
              </Section>
            </Tabs>
          </form>
        </Form>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Änderungen verwerfen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deine ungespeicherten Änderungen gehen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Weiter bearbeiten</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void cancelEditing()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwerfen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={statusOpen} onOpenChange={(open) => !statusBusy && setStatusOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-medium">
              Adresse {address?.isActive ? "deaktivieren" : "aktivieren"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {address?.isActive
                ? "Die Adresse und alle ihre Kontakte werden stillgelegt. Sie erscheint nicht mehr in neuen Auswahllisten; bestehende Verweise bleiben sichtbar. Gelöscht wird nichts."
                : "Die Adresse steht wieder in Auswahllisten zur Verfügung. Ihre Kontakte bleiben inaktiv und können einzeln aktiviert werden."}
              {askAboutChildren && (
                <>
                  {" "}
                  <strong>
                    Es gibt {address?.isActive ? `${activeChildCount} aktive ` : `${childAddresses.length} `}
                    direkt untergeordnete Adresse{(address?.isActive ? activeChildCount : childAddresses.length) === 1 ? "" : "n"}.
                    Sollen die untergeordneten Adressen (alle Ebenen) auch{" "}
                    {address?.isActive ? "deaktiviert" : "aktiviert"} werden?
                  </strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={statusBusy}>Abbrechen</AlertDialogCancel>
            {askAboutChildren ? (
              <>
                <Button
                  variant="outline"
                  disabled={statusBusy}
                  onClick={() => void changeStatus(false)}
                >
                  {statusBusy ? "Bitte warten …" : "Nein, nur diese Adresse"}
                </Button>
                <Button disabled={statusBusy} onClick={() => void changeStatus(true)}>
                  {statusBusy ? "Bitte warten …" : "Ja, inklusive untergeordnete"}
                </Button>
              </>
            ) : (
              <AlertDialogAction
                disabled={statusBusy}
                onClick={(event) => {
                  event.preventDefault()
                  void changeStatus(false)
                }}
              >
                {statusBusy ? "Bitte warten …" : address?.isActive ? "Deaktivieren" : "Aktivieren"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Section({ id, children }: { id: TabId; children: React.ReactNode }) {
  // forceMount: alle Reiter bleiben im Formular, damit Eingaben und Prüfung über alle Reiter gelten;
  // der inaktive Reiter wird per `data-[state=inactive]:hidden` ausgeblendet.
  return (
    <TabsContent
      value={id}
      forceMount
      className="rounded-[18px] border bg-card p-6 data-[state=inactive]:hidden"
    >
      {children}
    </TabsContent>
  )
}
