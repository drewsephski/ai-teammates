"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { useState } from "react"
import { KeyRoundIcon, PlusIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { deleteSecret, saveSecret } from "@/actions/secrets"
import { SecretValueInput } from "@/components/chat-secret-request"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { userSecretInputSchema } from "@/db/schema"
import type { PublicSecret } from "@/lib/user-secrets"

type WorkspaceSecret = Pick<PublicSecret, "name" | "label" | "updatedAt">

// Adds a key, or with `secret` replaces that key's value under the same name.
// The value stays in this form and goes straight to the server action.
function SecretForm({
  secret,
  onSaved,
}: {
  secret?: WorkspaceSecret
  onSaved: () => void
}) {
  const form = useForm({
    resolver: zodResolver(userSecretInputSchema),
    defaultValues: {
      name: secret?.name ?? "",
      label: secret?.label ?? "",
      value: "",
    },
  })
  const { isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { secret: saved } = await saveSecret(values)
      form.reset({ name: "", label: "", value: "" })
      toast.add({ type: "success", title: `${saved.label} saved` })
      onSaved()
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't save the key",
        description: "Try again.",
      })
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <Controller
          name="label"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="secret-label">Label</FieldLabel>
              <Input
                {...field}
                id="secret-label"
                placeholder="OpenAI API key"
                autoComplete="off"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="secret-name">Variable name</FieldLabel>
              <Input
                {...field}
                id="secret-name"
                placeholder="OPENAI_API_KEY"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono"
                readOnly={Boolean(secret)}
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Your bots use it as ${field.value || "NAME"} in commands on your
                computer.
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="value"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="secret-value">Key</FieldLabel>
              <SecretValueInput
                {...field}
                id="secret-value"
                disabled={isSubmitting}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Encrypted and set only on your computer. Your bots never see it
                in chat.
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
          {secret ? "Replace key" : "Save key"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function SecretDialog({
  secret,
  trigger,
  children,
}: {
  secret?: WorkspaceSecret
  trigger: React.ReactElement
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {secret ? `Replace ${secret.label}` : "Add API key"}
          </DialogTitle>
          <DialogDescription>
            {secret
              ? "Paste the new key. Your bots use it from their next command."
              : "Your bots can use it in commands on your computer, never in chat."}
          </DialogDescription>
        </DialogHeader>
        <SecretForm secret={secret} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SecretDeleteButton({ secret }: { secret: WorkspaceSecret }) {
  const [open, setOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const onDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteSecret(secret.name)
      toast.add({ type: "success", title: `${secret.label} deleted` })
      setOpen(false)
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't delete the key",
        description: "Try again.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(open) => !isDeleting && setOpen(open)}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${secret.label}`}
          />
        }
      >
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {secret.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Commands on your computer lose ${secret.name}, and a bot that needs
            it will ask again. It can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting && <Spinner data-icon="inline-start" />}
            Delete key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function WorkspaceSecrets({ secrets }: { secrets: WorkspaceSecret[] }) {
  return (
    <section aria-labelledby="workspace-secrets-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="workspace-secrets-title" className="text-sm font-medium">
          API keys
        </h2>
        <SecretDialog trigger={<Button variant="ghost" size="sm" />}>
          <PlusIcon data-icon="inline-start" />
          Add key
        </SecretDialog>
      </div>
      {secrets.length ? (
        <ul className="divide-y divide-border rounded-2xl bg-muted/60">
          {secrets.map((secret) => (
            <li
              key={secret.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <KeyRoundIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{secret.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">${secret.name}</span>
                  {" · Updated "}
                  <time
                    dateTime={new Date(secret.updatedAt).toISOString()}
                    suppressHydrationWarning
                  >
                    {format(secret.updatedAt, "MMM d, yyyy")}
                  </time>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <SecretDialog
                  secret={secret}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Replace ${secret.label}`}
                    />
                  }
                >
                  Replace
                </SecretDialog>
                <SecretDeleteButton secret={secret} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Bots ask for API keys in chat when a command needs one. Saved keys
          show here.
        </p>
      )}
    </section>
  )
}
