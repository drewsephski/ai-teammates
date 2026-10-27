"use client"

import { useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import Link from "next/link"
import { KraftySignIn } from "@/components/auth-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ForgotPassword() {
  const { signIn } = useSignIn()
  const [step, setStep] = useState<"email" | "code" | "password" | "finish">(
    "email"
  )
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (step === "email") {
        const created = await signIn.create({ identifier: email.trim() })
        if (created.error) throw created.error
        const sent = await signIn.resetPasswordEmailCode.sendCode()
        if (sent.error) throw sent.error
        setStep("code")
      } else if (step === "code") {
        const verified = await signIn.resetPasswordEmailCode.verifyCode({
          code,
        })
        if (verified.error) throw verified.error
        setStep("password")
      } else if (step === "password") {
        const reset = await signIn.resetPasswordEmailCode.submitPassword({
          password,
          signOutOfOtherSessions: true,
        })
        if (reset.error) throw reset.error
        setPassword("")
        if (signIn.status === "complete") {
          const finalized = await signIn.finalize({
            navigate: ({ session, decorateUrl }) => {
              window.location.assign(
                decorateUrl(session?.currentTask ? "/sign-in" : "/workspace")
              )
            },
          })
          if (finalized.error) throw finalized.error
        }
        // Let Clerk's widget complete MFA or any remaining session requirements.
        setStep("finish")
      }
    } catch (cause) {
      const message =
        cause && typeof cause === "object" && "longMessage" in cause
          ? cause.longMessage
          : cause && typeof cause === "object" && "message" in cause
            ? cause.message
            : null
      setError(
        typeof message === "string"
          ? message
          : "Couldn't reset your password. Please try again."
      )
    } finally {
      setBusy(false)
    }
  }

  if (step === "finish") {
    return (
      <div className="flex w-full flex-col gap-5">
        <p role="status" className="text-center text-sm">
          Your password has been updated. Finish signing in below.
        </p>
        <KraftySignIn routing="hash" fallbackRedirectUrl="/workspace" />
      </div>
    )
  }

  return (
    <section
      className="w-full rounded-3xl bg-card p-6 ring-1 ring-border sm:p-8"
      aria-labelledby="reset-title"
    >
      <h2 id="reset-title" className="text-xl font-medium">
        {step === "password" ? "Set a new password" : "Forgot your password?"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {step === "email"
          ? "Enter your email to receive a password reset code."
          : step === "code"
            ? `Enter the reset code sent to ${email}.`
            : "Choose a new password. Your other sessions will be signed out."}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-value">
            {step === "email"
              ? "Email address"
              : step === "code"
                ? "Reset code"
                : "New password"}
          </Label>
          <Input
            key={step}
            id="reset-value"
            name={step}
            type={
              step === "email"
                ? "email"
                : step === "password"
                  ? "password"
                  : "text"
            }
            autoComplete={
              step === "email"
                ? "email"
                : step === "code"
                  ? "one-time-code"
                  : "new-password"
            }
            inputMode={step === "code" ? "numeric" : undefined}
            value={step === "email" ? email : step === "code" ? code : password}
            onChange={(event) =>
              (step === "email"
                ? setEmail
                : step === "code"
                  ? setCode
                  : setPassword)(event.target.value)
            }
            required
            disabled={busy}
            aria-describedby={error ? "reset-error" : undefined}
            aria-invalid={!!error}
          />
        </div>
        {error && (
          <p id="reset-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : step === "email"
              ? "Send reset code"
              : step === "code"
                ? "Verify code"
                : "Reset password"}
        </Button>
        {step === "code" && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setStep("email")
              setCode("")
              setError(null)
            }}
          >
            Use another email or request a new code
          </Button>
        )}
      </form>
      <Link
        href="/sign-in"
        className="mt-5 block text-center text-sm text-muted-foreground underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </section>
  )
}
