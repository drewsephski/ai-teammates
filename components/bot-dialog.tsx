"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { updateBot } from "@/actions/bot"
import { BotDeleteDialog } from "@/components/bot-delete-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
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
  FieldTitle,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { botInsertSchema, type Bot } from "@/db/schema"
import { createBotAvatar } from "@/lib/bot-avatar"

import { botPresets } from "@/lib/bot-presets"

// Asks for confirmation, then deletes the bot and leaves its chat
function BotDeleteButton({
  bot,
  onDeleted,
}: {
  bot: Bot
  onDeleted: () => void
}) {
  const router = useRouter()
  return (
    <BotDeleteDialog
      bot={bot}
      onDeleted={() => {
        onDeleted()
        router.push("/workspace")
      }}
    >
      <Button type="button" variant="destructive" className="sm:mr-auto">
        <Trash2Icon data-icon="inline-start" />
        Delete
      </Button>
    </BotDeleteDialog>
  )
}

// Manual editing remains available after conversational creation.
function BotForm({ bot, onSaved }: { bot: Bot; onSaved: () => void }) {
  const initialSeed = bot.avatar
  const form = useForm({
    resolver: zodResolver(botInsertSchema),
    defaultValues: {
      name: bot.name,
      avatar: initialSeed,
      job: bot.job,
      instructions: bot.instructions ?? "",
    },
  })
  const { isSubmitting } = form.formState
  const selectedJob = useWatch({ control: form.control, name: "job" })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const updated = await updateBot(bot.id, values)
      toast.add({ type: "success", title: `${updated.name} is updated` })
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't update the bot",
        description: "Something went wrong. Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldSet>
        <FieldLegend variant="label">Start with a role</FieldLegend>
        <FieldDescription>
          Pick a starting point, then make it yours.
        </FieldDescription>
        <div className="grid grid-cols-3 gap-2">
          {botPresets.map((preset) => (
            <Button
              key={preset.job}
              type="button"
              variant={selectedJob === preset.job ? "secondary" : "outline"}
              size="sm"
              className="h-16 min-w-0 flex-col gap-1 rounded-xl px-1 text-xs"
              aria-label={`Use ${preset.job} preset`}
              aria-pressed={selectedJob === preset.job}
              disabled={isSubmitting}
              onClick={() => {
                form.setValue("job", preset.job, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
                form.setValue("instructions", preset.instructions, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }}
            >
              <preset.icon data-icon="inline-start" />
              {preset.label}
            </Button>
          ))}
        </div>
      </FieldSet>
      <FieldGroup>
        <Controller
          name="avatar"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <ChatAvatar
                seed={field.value ?? initialSeed}
                className="size-10"
              />
              <FieldContent>
                <FieldTitle>Face</FieldTitle>
                <FieldDescription>
                  Shuffle until you find one you like.
                </FieldDescription>
              </FieldContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => field.onChange(createBotAvatar())}
              >
                <ShuffleIcon data-icon="inline-start" />
                Shuffle
              </Button>
            </Field>
          )}
        />
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="bot-name">Name</FieldLabel>
              <Input
                {...field}
                id="bot-name"
                placeholder="Ada"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="job"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="bot-job">Job</FieldLabel>
              <Input
                {...field}
                id="bot-job"
                placeholder="Research assistant"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="instructions"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="bot-instructions">
                How it should work
              </FieldLabel>
              <Textarea
                {...field}
                value={field.value ?? ""}
                id="bot-instructions"
                placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                className="min-h-24"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <BotDeleteButton bot={bot} onDeleted={onSaved} />
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  )
}

// Renders its own trigger from `children`, as `trigger` if given. Without
// children it has no trigger and is opened by the parent through `open` /
// `onOpenChange`. Creation happens in the chat, not this editor.
function BotDialog({
  bot,
  trigger = <Button variant="secondary" />,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  bot: Bot
  trigger?: React.ReactElement
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen

  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={trigger}>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit bot</DialogTitle>
          <DialogDescription>
            Change its face, its name, or the job it does.
          </DialogDescription>
        </DialogHeader>
        <BotForm bot={bot} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export { BotDialog }
