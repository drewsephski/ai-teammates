"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"

import { sendFeedback } from "@/actions/feedback"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import {
  feedbackInputSchema,
  type FeedbackInput,
  type ParsedFeedback,
} from "@/lib/feedback"
import { supportEmail } from "@/lib/marketing/site"

// Mounted on open, so every open starts empty
function FeedbackForm({ onSent }: { onSent: () => void }) {
  const form = useForm<FeedbackInput, unknown, ParsedFeedback>({
    resolver: zodResolver(feedbackInputSchema),
    defaultValues: { message: "" },
  })
  const { isSubmitting } = form.formState
  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await sendFeedback({
        ...values,
        page: window.location.pathname,
        source: "web",
      })
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't send your feedback",
          description: result.message,
        })
        return
      }
      toast.add({
        type: "success",
        title: "Feedback sent",
        description: "Thanks. We read every message.",
      })
      onSent()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't send your feedback",
        description: `Your message is still here. Try again, or email ${supportEmail}.`,
      })
    }
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup>
        <Controller
          name="message"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="feedback-message">
                What happened, or what would help?
              </FieldLabel>
              <Textarea
                {...field}
                id="feedback-message"
                rows={6}
                autoFocus
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Include what you expected and what you saw. Leave out passwords
                and other private details.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
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
          Send feedback
        </Button>
      </DialogFooter>
    </form>
  )
}

// Opened from the account menu, which is Clerk's and can't hold a trigger
function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Report a problem or suggest something. It goes straight to the
            Krafty team, along with your account ID and the page you were on.
          </DialogDescription>
        </DialogHeader>
        <FeedbackForm onSent={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

export { FeedbackDialog }
