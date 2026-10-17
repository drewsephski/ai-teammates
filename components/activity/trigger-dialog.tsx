"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { createTrigger } from "@/actions/triggers"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { botTriggerInsertSchema, type Bot } from "@/db/schema"

type TriggerBot = Pick<Bot, "id" | "name">

const kinds = {
  webhook: "A webhook is called",
  email: "An email arrives",
}

// The first message among a list field's per-item errors
function listError(error: unknown) {
  if (!error || typeof error !== "object") return undefined
  if ("message" in error && typeof error.message === "string")
    return error.message
  return Object.values(error as Record<string, { message?: string }>).find(
    (item) => item?.message
  )?.message
}

// Senders are typed as one comma-separated line and kept as a list
function SendersInput({
  id,
  value,
  invalid,
  onChange,
  onBlur,
}: {
  id: string
  value: string[]
  invalid: boolean
  onChange: (value: string[]) => void
  onBlur: () => void
}) {
  const [text, setText] = useState(() => value.join(", "))
  return (
    <Input
      id={id}
      value={text}
      placeholder="ana@example.com, @example.com"
      autoComplete="off"
      aria-invalid={invalid}
      onBlur={onBlur}
      onChange={(event) => {
        setText(event.target.value)
        onChange(
          event.target.value
            .split(/[,\s]+/)
            .map((sender) => sender.trim())
            .filter(Boolean)
        )
      }}
    />
  )
}

function TriggerForm({
  bots,
  emailAvailable,
  onSaved,
}: {
  bots: TriggerBot[]
  emailAvailable: boolean
  onSaved: () => void
}) {
  const [requestId] = useState(() => crypto.randomUUID())
  const form = useForm({
    resolver: zodResolver(botTriggerInsertSchema),
    defaultValues: {
      botId: bots[0]?.id ?? "",
      kind: "webhook" as "webhook" | "email",
      title: "",
      prompt: "",
      allowedSenders: [] as string[],
      requestId,
    },
  })
  const { isSubmitting } = form.formState
  const kind = useWatch({ control: form.control, name: "kind" })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await createTrigger(values)
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't add the trigger",
          description: result.message,
        })
        return
      }
      toast.add({
        type: "success",
        title: `${result.trigger.title} is ready`,
        description:
          result.trigger.kind === "email"
            ? "Send or forward mail to its address."
            : "Send events to its URL.",
      })
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't add the trigger",
        description: "Something went wrong. Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col gap-4">
      <FieldGroup className="min-h-0 overflow-y-auto">
        <Controller
          name="botId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="trigger-bot">Bot</FieldLabel>
              <Select
                items={bots.map((bot) => ({ value: bot.id, label: bot.name }))}
                name={field.name}
                inputRef={field.ref}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger
                  id="trigger-bot"
                  className="w-full"
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bots.map((bot) => (
                    <SelectItem key={bot.id} value={bot.id}>
                      {bot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="kind"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="trigger-kind">When</FieldLabel>
              <Select
                items={kinds}
                name={field.name}
                inputRef={field.ref}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger
                  id="trigger-kind"
                  className="w-full sm:w-64"
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">{kinds.webhook}</SelectItem>
                  <SelectItem value="email" disabled={!emailAvailable}>
                    {kinds.email}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {field.value === "email"
                  ? "The bot gets its own address. Forward mail to it, or set up a filter that does."
                  : "The bot gets its own URL. Point GitHub, Stripe, Zapier or any service that sends webhooks at it."}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="trigger-title">Name</FieldLabel>
              <Input
                {...field}
                id="trigger-title"
                placeholder={
                  kind === "email" ? "Invoices inbox" : "New pull request"
                }
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="prompt"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="trigger-prompt">
                What to do with each event
              </FieldLabel>
              <Textarea
                {...field}
                id="trigger-prompt"
                rows={4}
                placeholder={
                  kind === "email"
                    ? "Pull the amount, due date and vendor from each invoice and add a row to my expenses sheet."
                    : "Review the pull request and tell me what needs attention before I merge it."
                }
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                The bot works on its own and reports back in its chat. It treats
                what arrives as information, not instructions, and sending,
                posting or deleting still waits for your approval.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {kind === "email" && (
          <Controller
            name="allowedSenders"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="trigger-senders">
                  Only accept mail from
                </FieldLabel>
                <SendersInput
                  id="trigger-senders"
                  value={field.value ?? []}
                  invalid={fieldState.invalid}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
                <FieldDescription>
                  Addresses or whole domains. Leave it empty to accept anyone
                  who knows the address.
                </FieldDescription>
                {listError(fieldState.error) && (
                  <FieldError>{listError(fieldState.error)}</FieldError>
                )}
              </Field>
            )}
          />
        )}
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Add trigger
        </Button>
      </DialogFooter>
    </form>
  )
}

export function TriggerDialog({
  bots,
  emailAvailable,
}: {
  bots: TriggerBot[]
  emailAvailable: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" size="sm" disabled={!bots.length} />}
      >
        <PlusIcon data-icon="inline-start" />
        New trigger
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New trigger</DialogTitle>
          <DialogDescription>
            A bot starts work the moment something happens, even when
            you&apos;re away, and notifies your phone when it&apos;s done.
          </DialogDescription>
        </DialogHeader>
        <TriggerForm
          bots={bots}
          emailAvailable={emailAvailable}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
