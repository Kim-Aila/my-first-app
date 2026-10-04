"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Pencil, Power } from "lucide-react"
import { toast } from "sonner"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
  toArticlePayload,
  type Article,
  type ArticleFormValues,
} from "@/lib/articles"
import { formatDecimal } from "@/lib/decimal"
import type { LockHolder } from "@/lib/edit-lock"
import { getMerkmalByArticleKey } from "@/lib/merkmale"

const SECTION_IDS = ["kern", "klassifizierung", "zertifizierungen", "logistik", "steuern"] as const

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
  const [openSections, setOpenSections] = React.useState<string[]>([...SECTION_IDS])
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
  const { isDirty } = form.formState

  const lockLost = lock.status === "lost"
  const fieldsDisabled = !isEditing || lockLost || saving
  const watched = form.watch()

  // ---- Berechnete Anzeige -------------------------------------------------------------------
  const baseItem = references.baseArticleId?.find((i) => i.id === watched.baseArticleId)
  const seasonItem = references.seasonId?.find((i) => i.id === watched.seasonId)
  const typeItem = references.articleTypeId?.find((i) => i.id === watched.articleTypeId)
  const previewNumber = computeArticleNumber(
    typeof baseItem?.values.code === "string" ? baseItem.values.code : null,
    watched.kennziffer
  )
  const articleNumber = isEditing ? previewNumber : (article?.articleNumber ?? previewNumber)
  const commodityGroup = computeCommodityGroup(
    typeof seasonItem?.values.commodityDigit === "number" ? seasonItem.values.commodityDigit : null,
    typeof typeItem?.values.commodityDigit === "number" ? typeItem.values.commodityDigit : null
  )
  const grossWeight = computeGrossWeight(watched.weight, watched.tara)

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
          } else if (result.field && result.field in values) {
            form.setError(result.field as keyof ArticleFormValues, { message: result.error })
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

  function onInvalid() {
    // Fehler in eingeklappten Abschnitten sichtbar machen.
    setOpenSections([...SECTION_IDS])
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
            ? "Pflichtfelder sind Basisartikel und Artikelkennziffer."
            : article.values.name || "Ohne Bezeichnung"
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
            <Accordion
              type="multiple"
              value={openSections}
              onValueChange={setOpenSections}
              className="space-y-4"
            >
              <Section id="kern" title="Kern & Identifikation">
                <div className="grid gap-4 md:grid-cols-2">
                  {renderReference("articleTypeId")}
                  {renderReference("baseArticleId", {
                    required: true,
                    onPick: prefillCustomsTariff,
                  })}
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
                    hint="Basisartikel-Nummer + Kennziffer, pro Mandant eindeutig."
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

              <Section id="klassifizierung" title="Klassifizierung">
                <div className="grid gap-4 md:grid-cols-2">
                  {renderReference("brandOwnerId")}
                  {renderReference("seasonId")}
                  {renderReference("formDesignId")}
                  {renderReference("packSizeId")}
                  {renderReference("flavorId")}
                </div>
              </Section>

              <Section id="zertifizierungen" title="Zertifizierungen">
                <div className="grid gap-3 sm:grid-cols-3">
                  <CheckField control={c} name="fairtrade" label="Fairtrade" disabled={fieldsDisabled} />
                  <CheckField control={c} name="rainforest" label="Rainforest" disabled={fieldsDisabled} />
                  <CheckField control={c} name="fsc" label="FSC" disabled={fieldsDisabled} />
                </div>
              </Section>

              <Section id="logistik" title="Verpackung & Logistik">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <TextField control={c} name="palletClass" label="Palettenklasse" disabled={fieldsDisabled} maxLength={50} />
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

              <Section id="steuern" title="Steuern & Zoll">
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
            </Accordion>
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

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <AccordionItem value={id} className="rounded-[18px] border bg-card px-6">
      <AccordionTrigger className="font-display text-lg font-medium hover:no-underline">
        {title}
      </AccordionTrigger>
      <AccordionContent className="pb-6">{children}</AccordionContent>
    </AccordionItem>
  )
}
