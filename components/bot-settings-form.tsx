"use client"

import { useId } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { updateBot } from "@/actions/bot"
import { botInsertSchema, type Bot } from "@/db/schema"
import {
  botColors,
  botShapes,
  createBotAvatar,
  parseBotAvatar,
} from "@/lib/bot-avatar"
import { BotDeleteDialog } from "@/components/bot-delete-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogFooter } from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { formatBudget, TASK_BUDGETS } from "@/lib/turn-spend"

const budgetItems = [
  { value: null, label: "No limit" },
  ...TASK_BUDGETS.map((budget) => ({
    value: budget as number,
    label: formatBudget(budget),
  })),
]

const colorNames = [
  "Red",
  "Blue",
  "Violet",
  "Orange",
  "Lime",
  "Lavender",
  "White",
  "Gray",
  "Green",
  "Black",
]

export function BotSettingsForm({
  bot,
  onSaved,
  onDeleted,
  inDialog = false,
}: {
  bot: Bot
  onSaved?: (bot: Bot) => void
  onDeleted: () => void
  inDialog?: boolean
}) {
  const id = useId()
  const router = useRouter()
  const values = {
    name: bot.name,
    job: bot.job,
    avatar: bot.avatar,
    instructions: bot.instructions ?? "",
    taskBudget: bot.taskBudget,
  }
  const form = useForm({
    resolver: zodResolver(botInsertSchema),
    defaultValues: values,
    values,
    resetOptions: { keepDirtyValues: true },
  })
  const avatarValue =
    useWatch({ control: form.control, name: "avatar" }) ?? bot.avatar
  const avatar = parseBotAvatar(avatarValue)
  const colorIndex = avatar ? botColors.indexOf(avatar.color) : 0
  const { isSubmitting, isDirty } = form.formState
  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await updateBot(bot.id, values)
      form.reset({
        name: saved.name,
        job: saved.job,
        avatar: saved.avatar,
        instructions: saved.instructions ?? "",
        taskBudget: saved.taskBudget,
      })
      toast.add({ type: "success", title: "Bot settings saved" })
      onSaved?.(saved)
      router.refresh()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save bot settings",
        description: "Your changes are still here. Try again.",
      })
    }
  })
  const save = (
    <Button
      type="submit"
      disabled={isSubmitting || !isDirty}
      className={inDialog ? undefined : "w-full"}
    >
      {isSubmitting && <Spinner data-icon="inline-start" />} Save changes
    </Button>
  )
  return (
    <form
      onSubmit={submit}
      className={
        inDialog ? "flex flex-col gap-5" : "flex min-h-0 flex-1 flex-col"
      }
    >
      <div
        className={inDialog ? undefined : "min-h-0 flex-1 overflow-y-auto p-5"}
      >
        <FieldGroup className="gap-7">
          <FieldSet disabled={isSubmitting}>
            <FieldLegend variant="label">Appearance</FieldLegend>
            <Controller
              name="avatar"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="relative flex items-center justify-center gap-4">
                    <ChatAvatar seed={avatarValue} className="size-16" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="absolute right-0"
                      disabled={isSubmitting}
                      onClick={() => field.onChange(createBotAvatar())}
                    >
                      <ShuffleIcon /> Shuffle
                    </Button>
                  </div>
                  <FieldLabel id={`${id}-shape-label`}>Shape</FieldLabel>
                  <div
                    role="group"
                    aria-labelledby={`${id}-shape-label`}
                    className="grid grid-cols-6 gap-1"
                  >
                    {botShapes.map((shape) => (
                      <Button
                        key={shape}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Use ${shape} shape`}
                        title={shape.replace(/^./, (letter) =>
                          letter.toUpperCase()
                        )}
                        aria-pressed={avatar?.shape === shape}
                        disabled={isSubmitting}
                        className="h-10 w-full rounded-lg aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-ring"
                        onClick={() =>
                          field.onChange(`blob:${shape}:${colorIndex}`)
                        }
                      >
                        <ChatAvatar
                          seed={`blob:${shape}:${colorIndex}`}
                          interactive
                          className="size-7"
                        />
                      </Button>
                    ))}
                  </div>
                  <FieldLabel>Color</FieldLabel>
                  <div
                    role="group"
                    aria-label="Avatar color"
                    className="grid grid-cols-5 gap-2"
                  >
                    {botColors.map((color, index) => (
                      <Button
                        key={color}
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${colorNames[index]} avatar`}
                        aria-pressed={avatar?.color === color}
                        disabled={isSubmitting}
                        className="w-full rounded-full aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-card"
                        onClick={() =>
                          field.onChange(
                            `blob:${avatar?.shape ?? "blob"}:${index}`
                          )
                        }
                      >
                        <span
                          className="size-5 rounded-full border border-foreground/15"
                          style={{ backgroundColor: color }}
                        />
                      </Button>
                    ))}
                  </div>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldSet>
          <FieldSet disabled={isSubmitting}>
            <FieldLegend variant="label">Identity</FieldLegend>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-name`}
                    maxLength={50}
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldSet>
          <FieldSet disabled={isSubmitting}>
            <FieldLegend variant="label">Role</FieldLegend>
            <FieldGroup className="gap-4">
              <Controller
                name="job"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${id}-job`}>Job</FieldLabel>
                    <Input
                      {...field}
                      id={`${id}-job`}
                      placeholder="Research assistant"
                      maxLength={100}
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
              <Controller
                name="instructions"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${id}-instructions`}>
                      Working instructions
                    </FieldLabel>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      id={`${id}-instructions`}
                      className="min-h-32"
                      maxLength={4000}
                      placeholder="How should this bot approach its work?"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Preferences, context, and boundaries for its work.
                    </FieldDescription>
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </FieldGroup>
          </FieldSet>

          <FieldSet disabled={isSubmitting}>
            <FieldLegend variant="label">Limits</FieldLegend>
            <Controller
              name="taskBudget"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-budget`}>
                    Spend limit per task
                  </FieldLabel>
                  <Select
                    items={budgetItems}
                    name={field.name}
                    inputRef={field.ref}
                    value={field.value ?? null}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id={`${id}-budget`}
                      className="w-full"
                      onBlur={field.onBlur}
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {budgetItems.map((item) => (
                        <SelectItem key={item.label} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    The most one task can use of your AI allowance, including
                    web searches. Computer time isn&apos;t counted. The bot
                    stops after the step that reaches it, and you can reply to
                    keep going.
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldSet>

          <BotDeleteDialog
            bot={bot}
            onDeleted={() => {
              onDeleted()
              router.push("/workspace")
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit text-destructive"
            >
              <Trash2Icon /> Delete bot
            </Button>
          </BotDeleteDialog>
        </FieldGroup>
      </div>
      {inDialog ? (
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          {save}
        </DialogFooter>
      ) : (
        <div className="shrink-0 border-t border-border/60 p-4">{save}</div>
      )}
    </form>
  )
}
