"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useId, useRef, useState, type ComponentProps } from "react"
import { Controller, useForm } from "react-hook-form"
import {
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
} from "lucide-react"
import { z } from "zod"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { SecretSaveInput } from "@/db/schema"
import { secretValueSchema } from "@/lib/secret-policy"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import { cn } from "@/lib/utils"

type SecretRequestPart = Extract<
  ChatUIMessage["parts"][number],
  { type: "tool-requestSecret" }
>

export type SaveSecretAction = (
  input: SecretSaveInput
) => Promise<{ woke?: boolean; inputSeq?: number }>

// Loaded on use, so the card (and its tests) don't pull in the server action
const saveViaAction: SaveSecretAction = async (input) =>
  (await import("@/actions/secrets")).saveSecret(input)

// Only the value is typed here; the name and label come from the bot's request
const secretFormSchema = z.object({ value: secretValueSchema })

function linkHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return undefined
  }
}

// A masked key field with a show/hide toggle. The value lives only in the
// form that renders it.
export function SecretValueInput({
  disabled,
  ...props
}: Omit<ComponentProps<typeof InputGroupInput>, "type">) {
  const [visible, setVisible] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        type={visible ? "text" : "password"}
        placeholder="Paste the key"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        disabled={disabled}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Hide key" : "Show key"}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

// A private card for an API key the bot asked for with requestSecret. The
// value stays inside this form and goes straight to the server, which saves
// it encrypted and wakes the bot; the model never sees it.
export function ChatSecretRequest({
  part,
  active,
  busy,
  chatId,
  botId,
  onResume,
  onAnswer,
  onDismiss,
  save = saveViaAction,
}: {
  part: SecretRequestPart
  active: boolean
  busy: boolean
  chatId?: string
  /** The bot that asked, from the message metadata. */
  botId?: string
  /** Picks up the turn the server started after the key was saved. */
  onResume?: (inputSeq?: number) => void
  /** Tells the bot in a message when the server couldn't wake it. */
  onAnswer: (answer: string) => void | boolean | Promise<void | boolean>
  onDismiss: () => void | boolean | Promise<void | boolean>
  /** Injected in tests; defaults to the saveSecret server action. */
  save?: SaveSecretAction
}) {
  const id = useId()
  const dismissed = useRef(false)
  const [dismissing, setDismissing] = useState(false)
  const form = useForm({
    resolver: zodResolver(secretFormSchema),
    defaultValues: { value: "" },
  })
  const { isSubmitting } = form.formState

  if (part.state !== "output-available" || part.output.state !== "requested")
    return null
  const { name, label, description, url } = part.output
  const host = url ? linkHost(url) : undefined
  const disabled = !active || busy || isSubmitting || dismissing

  const submit = form.handleSubmit(async ({ value }) => {
    if (disabled) return
    let result: Awaited<ReturnType<SaveSecretAction>>
    try {
      result = await save({
        name,
        label,
        value,
        ...(chatId && { chatId }),
        ...(botId && { botId }),
        questionId: part.toolCallId,
      })
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save the key",
        description: "Try again.",
      })
      return
    }
    form.reset({ value: "" })
    toast.add({ type: "success", title: `${label} saved` })
    if (result.woke) onResume?.(result.inputSeq)
    // Saved, but the bot wasn't reached: tell it in a message instead
    else await onAnswer(`I saved ${label} as $${name}.`)
  })

  async function dismiss() {
    if (dismissed.current || disabled) return
    dismissed.current = true
    setDismissing(true)
    try {
      if ((await onDismiss()) === false) dismissed.current = false
    } catch {
      dismissed.current = false
    } finally {
      setDismissing(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`Add ${label}`}
      className="flex max-w-sm flex-col gap-3 rounded-xl bg-muted/40 p-3"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <KeyRoundIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {url && host && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "self-start"
          )}
        >
          Open {host}
          <ExternalLinkIcon data-icon="inline-end" />
        </a>
      )}
      <Controller
        name="value"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-value`} className="sr-only">
              {label}
            </FieldLabel>
            <SecretValueInput
              {...field}
              id={`${id}-value`}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
            <FieldDescription className="text-xs">
              Encrypted and set only on your computer as ${name}. Your bots
              never see it in chat.
            </FieldDescription>
          </Field>
        )}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={disabled}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => void dismiss()}
        >
          Not now
        </Button>
      </div>
    </form>
  )
}
