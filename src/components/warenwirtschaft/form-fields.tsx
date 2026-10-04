"use client"

import type { Control, FieldPath, FieldValues } from "react-hook-form"

import { Checkbox } from "@/components/ui/checkbox"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

// Kleine Feld-Bausteine für das Artikelformular (Text, Zahl, Ja/Nein, Mehrzeilig).

interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>
  name: FieldPath<T>
  label: string
  disabled?: boolean
  hint?: string
  required?: boolean
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
  hint,
  required,
  unit,
  inputMode,
  maxLength,
  placeholder,
}: BaseFieldProps<T> & {
  unit?: string
  inputMode?: "text" | "numeric" | "decimal"
  maxLength?: number
  placeholder?: string
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {unit && <span className="font-normal text-muted-foreground"> ({unit})</span>}
            {required && <span aria-hidden="true"> *</span>}
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ""}
              disabled={disabled}
              inputMode={inputMode}
              maxLength={maxLength}
              placeholder={disabled ? undefined : placeholder}
              autoComplete="off"
              className="disabled:bg-muted/40 disabled:opacity-100"
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
  hint,
  maxLength,
}: BaseFieldProps<T> & { maxLength?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              value={field.value ?? ""}
              disabled={disabled}
              maxLength={maxLength}
              rows={3}
              className="disabled:bg-muted/40 disabled:opacity-100"
            />
          </FormControl>
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function CheckField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
  hint,
}: BaseFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border bg-card p-3">
          <FormControl>
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(next) => field.onChange(next === true)}
              disabled={disabled}
              className="mt-0.5 disabled:opacity-100"
            />
          </FormControl>
          <div className="grid gap-0.5">
            <FormLabel className="cursor-pointer">{label}</FormLabel>
            {hint && <FormDescription>{hint}</FormDescription>}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  )
}

/** Berechneter Wert (nur Anzeige). */
export function ComputedField({
  id,
  label,
  value,
  hint,
}: {
  id: string
  label: string
  value: string | null
  hint: string
}) {
  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-sm font-medium leading-none">
        {label}
      </p>
      <output
        id={id}
        aria-labelledby={`${id}-label`}
        className="flex h-10 w-full items-center rounded-md border border-dashed bg-muted/40 px-3 text-sm font-medium tabular-nums"
      >
        {value ?? <span className="font-normal text-muted-foreground">–</span>}
      </output>
      <p className="text-[0.8rem] text-muted-foreground">{hint}</p>
    </div>
  )
}
