"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  accountDeletionSchema,
  type AccountDeletionInput,
  type AccountDeletionResult,
} from "@/lib/account-deletion-policy"

export function DeleteAccountForm({
  deleteAction,
}: {
  deleteAction: (input: AccountDeletionInput) => Promise<AccountDeletionResult>
}) {
  const [result, setResult] = useState<AccountDeletionResult>()
  const form = useForm({
    resolver: zodResolver(accountDeletionSchema),
    defaultValues: { confirm: "" },
  })
  const { isSubmitting } = form.formState
  const submit = form.handleSubmit(async (input) => {
    setResult(undefined)
    try {
      setResult(await deleteAction(input))
    } catch {
      setResult({
        ok: false,
        message:
          "We could not confirm whether deletion finished. Try again if you can still sign in, or contact support.",
      })
    }
  })

  if (result?.ok)
    return (
      <div role="status" className="rounded-xl border p-4">
        <p>
          Your Krafty account has been deleted. You are signed out on all
          devices.
        </p>
        <p>Retained records described above may remain.</p>
        {result.appleSignIn === "manual" ? (
          <p>
            Apple authorization could not be revoked automatically. To remove
            it, open Settings on your iPhone, tap your name, choose Sign in with
            Apple, select Krafty, and choose Delete. On the web, visit{" "}
            <a href="https://account.apple.com">account.apple.com</a>, open
            Sign-In &amp; Security, then Sign in with Apple, select Krafty, and
            stop using Sign in with Apple.
          </p>
        ) : result.appleSignIn === undefined ? (
          <p>
            If you used Sign in with Apple, open your Apple Account settings,
            choose Sign in with Apple, select Krafty, and stop using Sign in
            with Apple if Krafty is still listed.
          </p>
        ) : null}
      </div>
    )

  return (
    <form
      onSubmit={submit}
      className="my-6 space-y-4"
      aria-label="Delete Krafty account"
    >
      <FieldGroup>
        <Controller
          name="confirm"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="delete-confirm">
                Type delete my account to confirm permanent deletion
              </FieldLabel>
              <Input
                {...field}
                id="delete-confirm"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.error ? "delete-confirm-error" : undefined
                }
                disabled={isSubmitting}
              />
              <FieldError
                id="delete-confirm-error"
                errors={[fieldState.error]}
              />
            </Field>
          )}
        />
      </FieldGroup>
      {result && !result.ok && <p role="alert">{result.message}</p>}
      <Button type="submit" variant="destructive" disabled={isSubmitting}>
        {isSubmitting && <Spinner data-icon="inline-start" />}
        {isSubmitting ? "Deleting account…" : "Delete my account"}
      </Button>
    </form>
  )
}
