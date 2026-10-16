"use client"

import { useId, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { MailIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  emailContentSchema,
  type EmailContent,
  type EmailDraft,
  type EmailDraftAction,
} from "@/lib/email-draft"

export function emailStateLabel(state: string) {
  switch (state) {
    case "pending":
      return "Needs approval"
    case "approved":
      return "Queued to send"
    case "running":
      return "Sending · awaiting confirmation"
    case "executed":
      return "Sent"
    case "denied":
      return "Discarded"
    case "expired":
      return "Expired · not sent"
    case "failed":
      return "Send not confirmed · check your sent mail before retrying"
    default:
      return "Checking email…"
  }
}

export function EmailDraftCard({
  draft,
  state,
  onAction,
}: {
  draft: EmailDraft
  state: string
  onAction: (
    input: EmailDraftAction
  ) => Promise<{ draft?: EmailDraft; woke: boolean }>
}) {
  const [pending, setPending] = useState<EmailDraftAction["action"]>()
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [showBcc, setShowBcc] = useState(!!draft.bcc)
  const lock = useRef(false)
  const revision = useRef(draft.revision)
  const form = useForm<EmailContent>({
    resolver: zodResolver(emailContentSchema),
    defaultValues: {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: draft.body,
    },
  })
  const editable = state === "pending" && !pending

  async function act(
    action: EmailDraftAction["action"],
    content?: EmailContent
  ) {
    if (lock.current) return
    lock.current = true
    setPending(action)
    setError("")
    setNotice("")
    try {
      const result = await onAction(
        action === "discard"
          ? { action }
          : { action, revision: revision.current, content: content! }
      )
      if (result.draft) {
        revision.current = result.draft.revision
        form.reset({
          to: result.draft.to,
          cc: result.draft.cc,
          bcc: result.draft.bcc,
          subject: result.draft.subject,
          body: result.draft.body,
        })
      }
      if (!result.woke)
        setNotice(
          "Saved. The bot is offline; message it to continue. Nothing is confirmed sent yet."
        )
      else if (action === "save") setNotice("Changes saved")
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't save this email. Your edits are still here."
      )
    } finally {
      lock.current = false
      setPending(undefined)
    }
  }

  function field(name: keyof EmailContent, label: string, multiline = false) {
    return (
      <Controller
        key={name}
        name={name}
        control={form.control}
        render={({ field: control, fieldState }) => (
          <Field
            data-invalid={!!fieldState.error}
            className={
              multiline
                ? "gap-1 pt-3"
                : "gap-1 border-b border-foreground/5 py-2.5"
            }
          >
            <div className={multiline ? "" : "flex items-start gap-2"}>
              <FieldLabel
                htmlFor={`${formId}-${name}`}
                className={
                  multiline || name === "subject"
                    ? "sr-only"
                    : "mt-1 w-auto shrink-0 text-xs font-normal text-muted-foreground"
                }
              >
                {label}
              </FieldLabel>
              {multiline ? (
                <textarea
                  {...control}
                  id={`${formId}-${name}`}
                  aria-invalid={!!fieldState.error}
                  disabled={!editable}
                  className="block [field-sizing:content] min-h-64 w-full resize-none bg-transparent text-sm leading-relaxed whitespace-pre-wrap outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-100"
                />
              ) : (
                <input
                  {...control}
                  id={`${formId}-${name}`}
                  aria-invalid={!!fieldState.error}
                  disabled={!editable || !draft.editable.includes(name)}
                  placeholder={
                    name === "cc" || name === "bcc"
                      ? "name@example.com"
                      : undefined
                  }
                  className={`min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-100 ${name === "subject" ? "font-semibold" : ""}`}
                />
              )}
              {name === "cc" &&
                draft.editable.includes("bcc") &&
                !showBcc &&
                editable && (
                  <button
                    type="button"
                    className="shrink-0 self-center text-xs text-muted-foreground"
                    onClick={() => setShowBcc(true)}
                  >
                    Bcc
                  </button>
                )}
            </div>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
    )
  }
  const formId = useId()
  return (
    <form
      aria-label="Email draft"
      onSubmit={(event) =>
        void form.handleSubmit((value) => act("send", value))(event)
      }
      className="w-[32rem] max-w-full min-w-0 rounded-3xl bg-muted/60 px-5 pt-4 pb-3 text-sm"
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <MailIcon
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />{" "}
        Mail
      </div>
      <FieldGroup className="gap-0">
        {field("subject", "Subject")}
        <div className="flex gap-2 border-b border-foreground/5 py-3">
          <span className="text-xs text-muted-foreground">From</span>
          <span className="min-w-0 break-all">
            {draft.from ?? "Connected email account"}
          </span>
        </div>
        {draft.inReplyTo && (
          <div className="flex gap-2 border-b border-foreground/5 py-3">
            <span className="shrink-0 text-xs text-muted-foreground">
              In reply to
            </span>
            <span className="min-w-0 break-words">{draft.inReplyTo}</span>
          </div>
        )}
        {field("to", "To")}
        {draft.editable.includes("cc") && field("cc", "Cc")}
        {showBcc && field("bcc", "Bcc")}
        {field("body", "Email body", true)}
      </FieldGroup>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="max-w-full text-xs text-muted-foreground">
          {emailStateLabel(state)}
        </p>
        {state === "pending" && (
          <div className="ml-auto flex items-center gap-1">
            {form.formState.isDirty && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!!pending}
                onClick={() =>
                  void form.handleSubmit((value) => act("save", value))()
                }
              >
                {pending === "save" ? <Spinner /> : "Save"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!pending}
              onClick={() => void act("discard")}
            >
              {pending === "discard" ? <Spinner /> : "Discard"}
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full px-4"
              disabled={!!pending}
            >
              {pending === "send" ? <Spinner /> : "Send"}
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </form>
  )
}
