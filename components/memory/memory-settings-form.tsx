"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { updateMemorySettings } from "@/actions/memory"
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
import { memorySettingsSchema } from "@/db/schema"

// The account-wide switch. It saves as soon as it is flipped.
export function MemorySettingsForm({
  memoryEnabled,
}: {
  memoryEnabled: boolean
}) {
  const form = useForm({
    resolver: zodResolver(memorySettingsSchema),
    defaultValues: { memoryEnabled },
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      await updateMemorySettings(values)
      toast.add({
        type: "success",
        title: values.memoryEnabled ? "Memory is on" : "Memory is off",
      })
    } catch {
      form.reset({ memoryEnabled: !values.memoryEnabled })
      toast.add({
        type: "error",
        title: "Couldn't change memory",
        description: "Try again.",
      })
    }
  })
  return (
    <form onSubmit={submit} className="rounded-2xl bg-muted/50 p-6">
      <FieldGroup>
        <Controller
          name="memoryEnabled"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor="memory-enabled">Memory</FieldLabel>
                <FieldDescription>
                  When it&apos;s off, teammates don&apos;t read or save
                  memories. What&apos;s saved stays here until you delete it.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </FieldContent>
              <Switch
                id="memory-enabled"
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
