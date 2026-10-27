"use client"

import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { updateMorningSummary } from "@/actions/activity"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { morningSummarySchema } from "@/db/schema"

// Saves as soon as it is flipped
export function MorningSummaryForm({
  enabled,
  timezoneSet,
}: {
  enabled: boolean
  timezoneSet: boolean
}) {
  const form = useForm({
    resolver: zodResolver(morningSummarySchema),
    defaultValues: { morningSummary: enabled },
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await updateMorningSummary(values)
      toast.add({
        type: "success",
        title: values.morningSummary
          ? "Morning summary is on"
          : "Morning summary is off",
      })
    } catch {
      form.reset({ morningSummary: !values.morningSummary })
      toast.add({
        type: "error",
        title: "Couldn't change the morning summary",
        description: "Try again.",
      })
    }
  })
  return (
    <form onSubmit={submit} className="rounded-2xl bg-muted/50 p-6">
      <FieldGroup>
        <Controller
          name="morningSummary"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor="morning-summary">
                  Morning summary
                </FieldLabel>
                <FieldDescription>
                  A notification on your phone at 8 a.m. with what your bots
                  finished, what didn&apos;t finish, and what&apos;s waiting for
                  you since the last one. It&apos;s skipped when nothing
                  happened.
                  {!timezoneSet && (
                    <>
                      {" "}
                      Set your timezone in{" "}
                      <Link
                        href="/memory"
                        className="underline underline-offset-2 hover:text-foreground"
                      >
                        About you
                      </Link>{" "}
                      to get it.
                    </>
                  )}
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </FieldContent>
              <Switch
                id="morning-summary"
                checked={field.value}
                disabled={form.formState.isSubmitting}
                aria-invalid={fieldState.invalid}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  void submit()
                }}
              />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  )
}
