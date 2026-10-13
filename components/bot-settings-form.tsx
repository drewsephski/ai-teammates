"use client"

import { useId } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuffleIcon, Trash2Icon } from "lucide-react"
import { updateBot } from "@/actions/bot"
import { botInsertSchema, type Bot } from "@/db/schema"
import { botColors, botShapes, createBotAvatar, parseBotAvatar } from "@/lib/bot-avatar"
import { BotDeleteDialog } from "@/components/bot-delete-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogFooter } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"

const colorNames = ["Red", "Blue", "Violet", "Orange", "Lime", "Lavender", "White", "Gray"]

export function BotSettingsForm({ bot, onSaved, onDeleted, inDialog = false }: {
  bot: Bot; onSaved: (bot: Bot) => void; onDeleted: () => void; inDialog?: boolean
}) {
  const id = useId()
  const router = useRouter()
  const form = useForm({ resolver: zodResolver(botInsertSchema), defaultValues: {
    name: bot.name, job: bot.job, avatar: bot.avatar, instructions: bot.instructions ?? "",
  } })
  const avatarValue = useWatch({ control: form.control, name: "avatar" }) ?? bot.avatar
  const avatar = parseBotAvatar(avatarValue)
  const colorIndex = avatar ? botColors.indexOf(avatar.color) : 0
  const { isSubmitting, isDirty } = form.formState
  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await updateBot(bot.id, values)
      form.reset({ name: saved.name, job: saved.job, avatar: saved.avatar, instructions: saved.instructions ?? "" })
      toast.add({ type: "success", title: "Bot settings saved" })
      onSaved(saved)
      router.refresh()
    } catch {
      toast.add({ type: "error", title: "Couldn't save bot settings", description: "Your changes are still here. Try again." })
    }
  })
  const save = <Button type="submit" disabled={isSubmitting || !isDirty} className={inDialog ? undefined : "w-full"}>
    {isSubmitting && <Spinner data-icon="inline-start" />} Save changes
  </Button>
  return <form onSubmit={submit} className={inDialog ? "flex flex-col gap-5" : "flex min-h-0 flex-1 flex-col"}>
    <div className={inDialog ? undefined : "min-h-0 flex-1 overflow-y-auto p-5"}>
      <FieldGroup className="gap-7">
        <FieldSet>
          <FieldLegend variant="label">Identity</FieldLegend>
          <Controller name="name" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input {...field} id={`${id}-name`} maxLength={50} autoComplete="off" aria-invalid={fieldState.invalid} />
            <FieldError errors={[fieldState.error]} />
          </Field>} />
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Role</FieldLegend>
          <FieldGroup className="gap-4">
            <Controller name="job" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${id}-job`}>Job</FieldLabel>
              <Input {...field} id={`${id}-job`} placeholder="Research assistant" maxLength={100} autoComplete="off" aria-invalid={fieldState.invalid} />
              <FieldError errors={[fieldState.error]} />
            </Field>} />
            <Controller name="instructions" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${id}-instructions`}>Working instructions</FieldLabel>
              <Textarea {...field} value={field.value ?? ""} id={`${id}-instructions`} className="min-h-32" maxLength={4000} placeholder="How should this bot approach its work?" aria-invalid={fieldState.invalid} />
              <FieldDescription>Preferences, context, and boundaries for its work.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>} />
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">Appearance</FieldLegend>
          <Controller name="avatar" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}>
            <div className="flex items-center justify-between gap-4">
              <ChatAvatar seed={avatarValue} className="size-16" />
              <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => field.onChange(createBotAvatar())}><ShuffleIcon /> Shuffle</Button>
            </div>
            <FieldLabel htmlFor={`${id}-shape`}>Shape</FieldLabel>
            <Select value={avatar?.shape ?? "blob"} disabled={isSubmitting} onValueChange={(shape) => {
              if (shape && botShapes.some((value) => value === shape)) field.onChange(`blob:${shape}:${colorIndex}`)
            }}>
              <SelectTrigger id={`${id}-shape`} className="w-full" aria-invalid={fieldState.invalid}><SelectValue>{(avatar?.shape ?? "blob").replace(/^./, (letter) => letter.toUpperCase())}</SelectValue></SelectTrigger>
              <SelectContent>{botShapes.map((shape) => <SelectItem key={shape} value={shape}>{shape.replace(/^./, (letter) => letter.toUpperCase())}</SelectItem>)}</SelectContent>
            </Select>
            <FieldLabel>Color</FieldLabel>
            <div role="group" aria-label="Avatar color" className="flex flex-wrap gap-2">
              {botColors.map((color, index) => <Button key={color} type="button" variant="ghost" size="icon-sm" aria-label={`${colorNames[index]} avatar`} aria-pressed={avatar?.color === color} disabled={isSubmitting} className="rounded-full aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-card" onClick={() => field.onChange(`blob:${avatar?.shape ?? "blob"}:${index}`)}>
                <span className="size-5 rounded-full" style={{ backgroundColor: color }} />
              </Button>)}
            </div>
            <FieldError errors={[fieldState.error]} />
          </Field>} />
        </FieldSet>
        <BotDeleteDialog bot={bot} onDeleted={() => { onDeleted(); router.push("/workspace") }}>
          <Button type="button" variant="ghost" size="sm" className="w-fit text-destructive"><Trash2Icon /> Delete bot</Button>
        </BotDeleteDialog>
      </FieldGroup>
    </div>
    {inDialog ? <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>{save}</DialogFooter>
      : <div className="shrink-0 border-t border-border/60 p-4">{save}</div>}
  </form>
}
