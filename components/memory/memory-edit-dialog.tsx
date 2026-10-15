"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { PencilIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { updateMemory } from "@/actions/memory"
import type { ListedMemory, Teammate } from "@/components/memory/memory-list"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { memoryUpdateSchema } from "@/db/schema"
import { memoryKindLabels, memoryKinds } from "@/lib/memory-policy"

// Mounted on open, so every open starts from the saved memory
function MemoryEditForm({
  memory,
  teammates,
  onSaved,
}: {
  memory: ListedMemory
  teammates: Teammate[]
  onSaved: () => void
}) {
  const form = useForm({
    resolver: zodResolver(memoryUpdateSchema),
    defaultValues: {
      content: memory.content,
      kind: memory.kind,
      botId: memory.botId,
      pinned: memory.pinned,
    },
  })
  const { isSubmitting } = form.formState
  const submit = form.handleSubmit(async (values) => {
    try {
      await updateMemory(memory.id, values)
      toast.add({ type: "success", title: "Memory updated" })
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't update the memory",
        description: "Your changes are still here. Try again.",
      })
    }
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup>
        <Controller
          name="content"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="memory-content">Memory</FieldLabel>
              <Textarea
                {...field}
                id="memory-content"
                rows={3}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="kind"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="memory-kind">Kind</FieldLabel>
              <NativeSelect
                {...field}
                id="memory-kind"
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                {memoryKinds.map((kind) => (
                  <NativeSelectOption key={kind} value={kind}>
                    {memoryKindLabels[kind]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="botId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="memory-scope">Who knows it</FieldLabel>
              <NativeSelect
                id="memory-scope"
                className="w-full"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value || null)}
                aria-invalid={fieldState.invalid}
              >
                <NativeSelectOption value="">All teammates</NativeSelectOption>
                {teammates.map((bot) => (
                  <NativeSelectOption key={bot.id} value={bot.id}>
                    Only {bot.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="pinned"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <FieldContent>
                <FieldLabel htmlFor="memory-pinned">Pin</FieldLabel>
                <FieldDescription>
                  Pinned memories are in every chat.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="memory-pinned"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-invalid={fieldState.invalid}
              />
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function MemoryEditDialog({
  memory,
  teammates,
}: {
  memory: ListedMemory
  teammates: Teammate[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit memory"
            title="Edit"
          />
        }
      >
        <PencilIcon />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit memory</DialogTitle>
          <DialogDescription>
            The earlier version is kept as history.
          </DialogDescription>
        </DialogHeader>
        <MemoryEditForm
          memory={memory}
          teammates={teammates}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
