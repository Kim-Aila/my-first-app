"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, type FieldErrors } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Pencil, Power } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EditLockBanner } from "@/components/edit-lock/edit-lock-banner"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { useUnsavedChangesEntry } from "@/components/unsaved-changes-provider"
import {
  CheckField,
  ComputedField,
  TextAreaField,
  TextField,
} from "@/components/warenwirtschaft/form-fields"
import { ReferenceLabel, ReferenceSelect } from "@/components/warenwirtschaft/reference-select"
import type { MaintenanceAccess, ReferenceData } from "@/components/warenwirtschaft/types"
import { useEditLock } from "@/hooks/use-edit-lock"
import { apiRequest } from "@/lib/api-client"
import {
  ARTICLE_LOCK_RESOURCE,
  ARTICLE_UNITS,
  EMPTY_ARTICLE_VALUES,
  articleFormSchema,
  computeArticleNumber,
  computeCommodityGroup,
  computeGrossWeight,
  computeMatchCode,
  suggestArticleName,
  toArticlePayload,
  type Article,
  type ArticleFormValues,
} from "@/lib/articles"
import { formatDecimal } from "@/lib/decimal"
import type { LockHolder } from "@/lib/edit-lock"
import { getMerkmalByArticleKey } from "@/lib/merkmale"

// Reiter der Artikelmaske; `fields` ordnet jedes Formularfeld seinem Reiter zu (Fehlermarkierung).
const TABS = [
  {
    id: "kern",
    title: "Kern & Identifikation",
    fields: ["articleTypeId", "baseArticleNumber", "kennziffer", "name", "description"],
  },
  {
    id: "klassifizierung",
    title: "Klassifizierung",
    fields: ["brandOwnerId", "seasonId", "baseArticleId", "formDesignId", "packSizeId", "flavorId"],
  },
  { id: "zertifizierungen", title: "Zertifizierungen", fields: ["fairtrade", "rainforest", "fsc"] },
  {
    id: "logistik",
    title: "Verpackung & Logistik",
    fields: [
      "palletClassId",
      "isMixed",
      "mixedCount",
      "gtinMain",
      "gtinMixed1",
      "gtinMixed2",
      "cartonEan",
      "cartonContent",
      "width",
      "length",
      "height",
      "weight",
      "tara",
      "palletFactor",
      "packagingGroupId",
    ],
  },
  { id: "steuern", title: "Steuern & Zoll", fields: ["vatRateId", "customsTariffNumber"] },
] as const

type TabId = (typeof TABS)[number]["id"]

/** Reiter, in denen mindestens ein Feld einen Fehler hat (in Reiter-Reihenfolge). */
function tabsWithErrors(errors: FieldErrors<ArticleFormValues>): TabId[] {
  return TABS.filter((tab) =>
    (tab.fields as readonly string[]).some((field) => field in errors)
  ).map((tab) => tab.id)
}

function tabOfField(field: string): TabId | undefined {
  return TABS.find((tab) => (tab.fields as readonly string[]).includes(field))?.id
}

interface ArticleFormProps {
  tenantId: string
  /** Ohne `article` wird ein neuer Artikel angelegt. */
  article: Article | null
  references: ReferenceData
  maintenanceAccess: MaintenanceAccess
  canWrite: boolean
  /** Fremde Sperre, die beim Laden der Seite bereits bestand. */
  lockedBy: LockHolder | null
}

type ReferenceFieldName =
  | "articleTypeId"
  | "baseArticleId"
  | "brandOwnerId"
  | "seasonId"
  | "formDesignId"
  | "packSizeId"
  | "flavorId"
  | "palletClassId"
  | "packagingGroupId"
  | "vatRateId"

export function ArticleForm({
  tenantId,
  article,
  references,
  maintenanceAccess,
  canWrite,
  lockedBy,
}: ArticleFormProps) {
  const router = useRouter()
  const isNew = article === null
  const [isEditing, setIsEditing] = React.useState(isNew)
  const [saving, setSaving] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<TabId>("kern")
  const [discardOpen, setDiscardOpen] = React.useState(false)
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)

  const lock = useEditLock({
    tenantId,
    resourceType: ARTICLE_LOCK_RESOURCE,
    resourceId: article?.id ?? "new",
  })

  const initialValues = article?.values ?? EMPTY_ARTICLE_VALUES
  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: initialValues,
  })
  const { isDirty, errors } = form.formState
  const errorTabs = tabsWithErrors(errors)

  const lockLost = lock.status === "lost"
  const fieldsDisabled = !isEditing || lockLost || saving
  const watched = form.watch()

  // ---- Berechnete Anzeige -------------------------------------------------------------------
  const baseItem = references.baseArticleId?.find((i) => i.id === watched.baseArticleId)
  const seasonItem = references.seasonId?.find((i) => i.id === watched.seasonId)
  const typeItem = references.articleTypeId?.find((i) => i.id === watched.articleTypeId)
  const previewNumber = computeArticleNumber(watched.baseArticleNumber, watched.kennziffer)
  const articleNumber = isEditing ? previewNumber : (article?.articleNumber ?? previewNumber)
  const codeOf = (key: "brandOwnerId" | "formDesignId" | "packSizeId" | "flavorId") => {
    const code = references[key]?.find((i) => i.id === watched[key])?.values.code
    return typeof code === "string" ? code : null
  }
  const codeOfItem = (item: typeof baseItem) =>
    typeof item?.values.code === "string" ? item.values.code : null
  const previewMatchCode = computeMatchCode([
    codeOfItem(typeItem),
    codeOf("brandOwnerId"),
    codeOfItem(seasonItem),
    codeOfItem(baseItem),
    codeOf("formDesignId"),
    codeOf("packSizeId"),
    codeOf("flavorId"),
  ])
  const matchCode = isEditing ? previewMatchCode : (article?.matchCode ?? previewMatchCode)
  const commodityGroup = computeCommodityGroup(
    typeof seasonItem?.values.commodityDigit === "number" ? seasonItem.values.commodityDigit : null,
    typeof typeItem?.values.commodityDigit === "number" ? typeItem.values.commodityDigit : null
  )
  const grossWeight = computeGrossWeight(watched.weight, watched.tara)

  // Bezeichnungs-Vorschlag: füllt die Bezeichnung, solange sie leer ist oder noch dem zuletzt
  // vorgeschlagenen Text entspricht. Eine manuell geänderte Bezeichnung wird nie überschrieben;
  // bestehende Bezeichnungen gelten als manuell. Es reagiert nur auf geänderte Merkmale, nicht
  // schon auf das Öffnen des Bearbeitungsmodus.
  const nameOf = (item: typeof baseItem) =>
    typeof item?.values.name === "string" ? item.values.name : null
  const suggestedName = suggestArticleName([
    nameOf(baseItem),
    nameOf(references.formDesignId?.find((i) => i.id === watched.formDesignId)),
    nameOf(references.packSizeId?.find((i) => i.id === watched.packSizeId)),
    nameOf(references.flavorId?.find((i) => i.id === watched.flavorId)),
  ])
  const lastSuggestion = React.useRef<string>(suggestedName)
  React.useEffect(() => {
    if (!isEditing || suggestedName === lastSuggestion.current) return
    const current = form.getValues("name")
    if (current === "" || current === lastSuggestion.current) {
      form.setValue("name", suggestedName, { shouldDirty: true })
    }
    lastSuggestion.current = suggestedName
  }, [form, isEditing, suggestedName])

  // Neue Einträge in der Pflege-Maske (anderer Tab) sollen nach Rückkehr auswählbar sein;
  // `router.refresh()` lädt die Serverdaten neu, ohne den Formularzustand zu verlieren.
  React.useEffect(() => {
    if (!isEditing) return
    const onFocus = () => router.refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [isEditing, router])

  // ---- Speichern ----------------------------------------------------------------------------
  const submit = React.useCallback(
    async (values: ArticleFormValues, options: { navigate: boolean }): Promise<boolean> => {
      setFormError(null)
      setSaving(true)
      try {
        const body = toArticlePayload(values)
        const result = article
          ? await apiRequest(`/api/tenants/${tenantId}/articles/${article.id}`, {
              method: "PATCH",
              body,
            })
          : await apiRequest<{ id?: string }>(`/api/tenants/${tenantId}/articles`, {
              method: "POST",
              body,
            })

        if (!result.ok) {
          const duplicate = result.status === 409 && (!result.field || result.field === "articleNumber")
          if (duplicate && !/gesperrt|bearbeitet/i.test(result.error)) {
            form.setError("kennziffer", { message: result.error })
            setActiveTab("kern")
          } else if (result.field && result.field in values) {
            form.setError(result.field as keyof ArticleFormValues, { message: result.error })
            setActiveTab(tabOfField(result.field) ?? "kern")
          } else {
            setFormError(result.error)
          }
          return false
        }

        toast.success(article ? "Artikel gespeichert" : "Artikel angelegt")
        form.reset(values)
        if (article) {
          await lock.release()
          setIsEditing(false)
          router.refresh()
        } else if (options.navigate) {
          const id = (result.data as { id?: string } | null)?.id
          router.push(
            id
              ? `/artikelstamm/${id}?mandant=${encodeURIComponent(tenantId)}`
              : `/artikelstamm?mandant=${encodeURIComponent(tenantId)}`
          )
        }
        return true
      } finally {
        setSaving(false)
      }
    },
    [article, form, lock, router, tenantId]
  )

  function onInvalid(fieldErrors: FieldErrors<ArticleFormValues>) {
    // Zum ersten Reiter mit Fehler springen, damit der Fehler sichtbar wird.
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

  // ---- Bearbeiten / Abbrechen / Status ------------------------------------------------------
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
    if (isNew) {
      router.push(`/artikelstamm?mandant=${encodeURIComponent(tenantId)}`)
      return
    }
    await lock.release()
    setIsEditing(false)
  }

  function requestCancel() {
    if (isDirty) setDiscardOpen(true)
    else void cancelEditing()
  }

  async function changeStatus() {
    if (!article) return
    setStatusBusy(true)
    try {
      const result = await apiRequest(`/api/tenants/${tenantId}/articles/${article.id}/status`, {
        method: "PATCH",
        body: { isActive: !article.isActive },
      })
      if (!result.ok) {
        toast.error(article.isActive ? "Deaktivieren fehlgeschlagen" : "Aktivieren fehlgeschlagen", {
          description: result.error,
        })
        return
      }
      toast.success(article.isActive ? "Artikel deaktiviert" : "Artikel aktiviert")
      setStatusOpen(false)
      router.refresh()
    } finally {
      setStatusBusy(false)
    }
  }

  // ---- Auswahlfelder ------------------------------------------------------------------------
  function renderReference(name: ReferenceFieldName, options: { required?: boolean; onPick?: (id: string) => void } = {}) {
    const config = getMerkmalByArticleKey(name)
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <ReferenceLabel
              config={config}
              tenantId={tenantId}
              canOpenMaintenance={maintenanceAccess[config.slug] === true}
              required={options.required}
            >
              {config.singular}
            </ReferenceLabel>
            <FormControl>
              <ReferenceSelect
                config={config}
                items={references[name] ?? []}
                value={field.value}
                onChange={(id) => {
                  field.onChange(id)
                  options.onPick?.(id)
                }}
                tenantId={tenantId}
                required={options.required}
                disabled={fieldsDisabled}
                canOpenMaintenance={maintenanceAccess[config.slug] === true}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  function prefillCustomsTariff(baseId: string) {
    const base = references.baseArticleId?.find((i) => i.id === baseId)
    const tariff = base?.values.customsTariffNumber
    if (typeof tariff === "string" && tariff && form.getValues("customsTariffNumber") === "") {
      form.setValue("customsTariffNumber", tariff, { shouldDirty: true })
    }
  }

  const title = isNew ? "Neuer Artikel" : article.articleNumber || "Artikel"
  const c = form.control

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={`/artikelstamm?mandant=${encodeURIComponent(tenantId)}`}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Zur Artikelliste
          </Link>
        </Button>
      </div>

      <PageHeader
        title={title}
        description={
          isNew
            ? "Pflichtfelder sind Basisartikelnummer und Artikelkennziffer."
            : [article.matchCode, article.values.name || "Ohne Bezeichnung"]
                .filter(Boolean)
                .join(" · ")
        }
        actions={
          <>
            {article && (
              <StatusBadge tone={article.isActive ? "positive" : "neutral"}>
                {article.isActive ? "Aktiv" : "Inaktiv"}
              </StatusBadge>
            )}
            {canWrite && !isEditing && article && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStatusOpen(true)}
                  disabled={lock.status === "acquiring"}
                >
                  <Power className="mr-1 h-4 w-4" aria-hidden="true" />
                  {article.isActive ? "Deaktivieren" : "Aktivieren"}
                </Button>
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
            noun="Artikel"
            onReacquire={reacquire}
            reacquiring={lock.status === "acquiring"}
          />
        )}

        {!canWrite && !isNew && (
          <Alert>
            <AlertTitle>Nur Lesezugriff</AlertTitle>
            <AlertDescription>
              Du darfst Artikeldaten ansehen, aber nicht bearbeiten.
            </AlertDescription>
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
                {TABS.map((tab) => {
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

              <Section id="kern">
                <div className="grid gap-4 md:grid-cols-2">
                  {renderReference("articleTypeId")}
                  <TextField
                    control={c}
                    name="baseArticleNumber"
                    label="Basisartikelnummer"
                    required
                    disabled={fieldsDisabled}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="bis zu 10 Ziffern, z. B. 12345"
                    hint="Nur Ziffern, höchstens 10 Stellen."
                  />
                  <TextField
                    control={c}
                    name="kennziffer"
                    label="Artikelkennziffer"
                    required
                    disabled={fieldsDisabled}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="4 Ziffern, z. B. 0042"
                    hint="Genau 4 Ziffern."
                  />
                  <ComputedField
                    id="article-number"
                    label="Artikelnummer"
                    value={articleNumber}
                    hint="Basisartikelnummer + „.“ + Kennziffer, pro Mandant eindeutig."
                  />
                  <ComputedField
                    id="article-match-code"
                    label="Matchcode"
                    value={matchCode || null}
                    hint="Kürzel der gewählten Merkmale, mit Bindestrich verbunden."
                  />
                  <ComputedField
                    id="article-commodity-group"
                    label="Warengruppe"
                    value={commodityGroup}
                    hint="Saison-Ziffer + Artikeltyp-Ziffer + 0 (fehlende Ziffern zählen als 0)."
                  />
                  <div className="md:col-span-2">
                    <TextField
                      control={c}
                      name="name"
                      label="Artikelbezeichnung"
                      disabled={fieldsDisabled}
                      maxLength={200}
                      hint="Wird aus Basisartikel, Form/Design, Packungsgröße und Geschmackssorte vorgeschlagen und bleibt frei änderbar."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <TextAreaField
                      control={c}
                      name="description"
                      label="Artikelbeschreibung"
                      disabled={fieldsDisabled}
                      maxLength={2000}
                    />
                  </div>
                </div>
              </Section>

              <Section id="klassifizierung">
                <div className="grid gap-4 md:grid-cols-2">
                  {renderReference("brandOwnerId")}
                  {renderReference("seasonId")}
                  {renderReference("baseArticleId", { onPick: prefillCustomsTariff })}
                  {renderReference("formDesignId")}
                  {renderReference("packSizeId")}
                  {renderReference("flavorId")}
                </div>
              </Section>

              <Section id="zertifizierungen">
                <div className="grid gap-3 sm:grid-cols-3">
                  <CheckField control={c} name="fairtrade" label="Fairtrade" disabled={fieldsDisabled} />
                  <CheckField control={c} name="rainforest" label="Rainforest" disabled={fieldsDisabled} />
                  <CheckField control={c} name="fsc" label="FSC" disabled={fieldsDisabled} />
                </div>
              </Section>

              <Section id="logistik">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {renderReference("palletClassId")}
                  <TextField
                    control={c}
                    name="cartonContent"
                    label="Kartoninhalt"
                    unit="Stück"
                    disabled={fieldsDisabled}
                    inputMode="numeric"
                  />
                  <TextField control={c} name="palletFactor" label="Palettenfaktor" disabled={fieldsDisabled} inputMode="decimal" />
                  <div className="md:col-span-2 lg:col-span-3">
                    <CheckField
                      control={c}
                      name="isMixed"
                      label="Mischartikel"
                      hint="Aktivieren, um Anzahl und weitere GTINs zu erfassen."
                      disabled={fieldsDisabled}
                    />
                  </div>
                  {watched.isMixed && (
                    <TextField
                      control={c}
                      name="mixedCount"
                      label="Anzahl Mischartikel"
                      disabled={fieldsDisabled}
                      inputMode="numeric"
                    />
                  )}
                  <TextField control={c} name="gtinMain" label="GTIN Hauptartikel" disabled={fieldsDisabled} inputMode="numeric" maxLength={14} />
                  {watched.isMixed && (
                    <>
                      <TextField control={c} name="gtinMixed1" label="GTIN Mischartikel 1" disabled={fieldsDisabled} inputMode="numeric" maxLength={14} />
                      <TextField control={c} name="gtinMixed2" label="GTIN Mischartikel 2" disabled={fieldsDisabled} inputMode="numeric" maxLength={14} />
                    </>
                  )}
                  <TextField control={c} name="cartonEan" label="Karton-EAN" disabled={fieldsDisabled} inputMode="numeric" maxLength={14} />
                  <TextField control={c} name="width" label="Breite" unit={ARTICLE_UNITS.dimension} disabled={fieldsDisabled} inputMode="decimal" />
                  <TextField control={c} name="length" label="Länge" unit={ARTICLE_UNITS.dimension} disabled={fieldsDisabled} inputMode="decimal" />
                  <TextField control={c} name="height" label="Höhe" unit={ARTICLE_UNITS.dimension} disabled={fieldsDisabled} inputMode="decimal" />
                  <TextField control={c} name="weight" label="Gewicht" unit={ARTICLE_UNITS.weight} disabled={fieldsDisabled} inputMode="decimal" />
                  <TextField control={c} name="tara" label="Tara" unit={ARTICLE_UNITS.weight} disabled={fieldsDisabled} inputMode="decimal" />
                  <ComputedField
                    id="article-gross-weight"
                    label={`Bruttogewicht (${ARTICLE_UNITS.weight})`}
                    value={grossWeight === null ? null : formatDecimal(grossWeight)}
                    hint="Gewicht + Tara, automatisch berechnet."
                  />
                  {renderReference("packagingGroupId")}
                </div>
              </Section>

              <Section id="steuern">
                <div className="grid gap-4 md:grid-cols-2">
                  {renderReference("vatRateId")}
                  <TextField
                    control={c}
                    name="customsTariffNumber"
                    label="Zolltarifnummer"
                    disabled={fieldsDisabled}
                    maxLength={20}
                    hint="Wird bei Auswahl eines Basisartikels vorbelegt, wenn dort hinterlegt."
                  />
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
              Artikel {article?.isActive ? "deaktivieren" : "aktivieren"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {article?.isActive
                ? "Der Artikel erscheint nicht mehr in Auswahllisten anderer Masken. Bestehende Datensätze, die ihn bereits verwenden, bleiben unverändert. Gelöscht wird nichts."
                : "Der Artikel steht wieder in Auswahllisten anderer Masken zur Verfügung."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusBusy}
              onClick={(event) => {
                event.preventDefault()
                void changeStatus()
              }}
            >
              {statusBusy ? "Bitte warten …" : article?.isActive ? "Deaktivieren" : "Aktivieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function Section({ id, children }: { id: TabId; children: React.ReactNode }) {
  // forceMount: alle Reiter bleiben im Formular, damit Eingaben und Prüfung über alle Reiter gelten;
  // der inaktive Reiter wird per `data-[state=inactive]:hidden` ausgeblendet
  // (Radix setzt bei forceMount kein `hidden`).
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
