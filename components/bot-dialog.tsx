"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { nanoid } from "nanoid"
import { Controller, useForm, useWatch } from "react-hook-form"

import { createBot, updateBot } from "@/actions/bot"
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
import { usePaywall } from "@/hooks/use-paywall"

import { botPresets, type BotPresetId } from "@/lib/bot-presets"

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

// With a `bot` it edits that bot, without one it creates a new bot
function BotForm({
  bot,
  presetId,
  onSaved,
}: {
  bot?: Bot
  presetId?: BotPresetId
  onSaved: () => void
}) {
  const preset = botPresets.find((preset) => preset.id === presetId)
  const [initialSeed] = useState(() => bot?.avatar ?? nanoid())
  const form = useForm({
    resolver: zodResolver(botInsertSchema),
    defaultValues: {
      name: bot?.name ?? "",
      avatar: initialSeed,
      job: bot?.job ?? preset?.job ?? "",
      instructions: bot?.instructions ?? preset?.instructions ?? "",
    },
  })
  const { isSubmitting } = form.formState
  const selectedJob = useWatch({ control: form.control, name: "job" })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (bot) {
        const updated = await updateBot(bot.id, values)
        toast.add({ type: "success", title: `${updated.name} is updated` })
      } else {
        const created = await createBot(values)
        toast.add({ type: "success", title: `${created.name} is ready` })
      }
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: bot ? "Couldn't update the bot" : "Couldn't create the bot",
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
              className="h-14 min-w-0 flex-col gap-1 px-1"
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
                onClick={() => field.onChange(nanoid())}
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
        {bot && <BotDeleteButton bot={bot} onDeleted={onSaved} />}
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          {bot ? "Save changes" : "Create bot"}
        </Button>
      </DialogFooter>
    </form>
  )
}

// Renders its own trigger from `children`, as `trigger` if given. Without
// children it has no trigger and is opened by the parent through `open` /
// `onOpenChange`. Pass `bot` to edit that bot instead of creating one.
function BotDialog({
  bot,
  presetId,
  trigger = <Button variant="secondary" />,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  bot?: Bot
  presetId?: BotPresetId
  trigger?: React.ReactElement
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const { checkPlan, checkUsage } = usePaywall()

  const setOpen = async (open: boolean) => {
    // Creating a bot is billable, and its sandbox starts running right away;
    // editing or deleting one never is
    if (open && !bot) {
      if (!checkPlan("bots") || !(await checkUsage("sandbox"))) return
    }
    ;(onOpenChange ?? setUncontrolledOpen)(open)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger render={trigger}>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
          <DialogDescription>
            {bot
              ? "Change its face, its name, or the job it does."
              : "Give it a face, a name, and a job to do."}
          </DialogDescription>
        </DialogHeader>
        <BotForm bot={bot} presetId={presetId} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export { BotDialog }
