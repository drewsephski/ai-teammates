"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { saveAboutYou } from "@/actions/memory"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { aboutYouSchema, type AboutYou } from "@/db/schema"

const textFields = [
  {
    name: "role",
    label: "Role",
    placeholder: "Product lead at Acme",
  },
  {
    name: "workingHours",
    label: "Working hours",
    placeholder: "9am to 5pm, Monday to Friday",
  },
  {
    name: "answerStyle",
    label: "How you like answers",
    placeholder: "Short bullet points, no small talk",
  },
] as const

export function AboutYouForm({
  values,
  timezones,
}: {
  values: AboutYou
  timezones: string[]
}) {
  const form = useForm({
    resolver: zodResolver(aboutYouSchema),
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
  })
  const { isSubmitting, isDirty } = form.formState
  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await saveAboutYou(values)
      form.reset(saved)
      toast.add({ type: "success", title: "Saved to memory" })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save",
        description: "Your changes are still here. Try again.",
      })
    }
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldSet disabled={isSubmitting}>
        <FieldLegend>About you</FieldLegend>
        <FieldDescription>
          Every teammate knows this from the start, so none of them has to ask.
        </FieldDescription>
        <FieldGroup>
          {textFields.map(({ name, label, placeholder }) => (
            <Controller
              key={name}
              name={name}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`about-${name}`}>{label}</FieldLabel>
                  <Input
                    {...field}
                    id={`about-${name}`}
                    placeholder={placeholder}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          ))}
          <Controller
            name="timezone"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="about-timezone">Timezone</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    {...field}
                    id="about-timezone"
                    className="w-full sm:w-72"
                    aria-invalid={fieldState.invalid}
                  >
                    <NativeSelectOption value="">Not set</NativeSelectOption>
                    {timezones.map((zone) => (
                      <NativeSelectOption key={zone} value={zone}>
                        {zone.replaceAll("_", " ")}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      field.onChange(
                        Intl.DateTimeFormat().resolvedOptions().timeZone
                      )
                    }
                  >
                    Use this device&apos;s
                  </Button>
                </div>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            name="about"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="about-about">Anything else</FieldLabel>
                <Textarea
                  {...field}
                  id="about-about"
                  rows={3}
                  placeholder="What you work on, who you work with, what you care about"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
      <Button
        type="submit"
        className="self-start"
        disabled={isSubmitting || !isDirty}
      >
        {isSubmitting && <Spinner data-icon="inline-start" />}
        Save
      </Button>
    </form>
  )
}
