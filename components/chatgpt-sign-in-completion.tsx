"use client"

import { useEffect, useRef, useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { KraftySignIn } from "@/components/auth-ui"

export function ChatGPTSignInCompletion() {
  const { signIn } = useSignIn()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const response = await fetch("/api/chatgpt/session", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
        })
        if (!response.ok) throw new Error("Expired sign-in")
        const data: unknown = await response.json()
        if (
          !data ||
          typeof data !== "object" ||
          !("ticket" in data) ||
          typeof data.ticket !== "string"
        )
          throw new Error("Invalid completion")
        const { error } = await signIn.ticket({ ticket: data.ticket })
        if (error) throw new Error("Incomplete sign-in")
        if (signIn.status !== "complete") {
          setNeedsVerification(true)
          return
        }
        const finalized = await signIn.finalize({
          navigate: ({ session, decorateUrl }) => {
            window.location.assign(
              decorateUrl(session?.currentTask ? "/sign-in" : "/workspace")
            )
          },
        })
        if (finalized.error) throw new Error("Could not finish sign-in")
      } catch {
        setFailed(true)
      }
    })()
  }, [signIn])
  if (needsVerification)
    return <KraftySignIn fallbackRedirectUrl="/workspace" />
  return (
    <div className="flex w-full flex-col items-center gap-5 rounded-2xl border p-8 text-center">
      <h1 className="text-xl font-medium">
        {failed
          ? "Sign-in could not be completed"
          : "Finishing ChatGPT sign-in"}
      </h1>
      {failed ? (
        <>
          <p role="alert" className="text-sm text-muted-foreground">
            Please start a new sign-in attempt.
          </p>
          <Link href="/sign-in" className={buttonVariants()}>
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <Spinner className="size-5" />
          <p role="status" className="text-sm text-muted-foreground">
            Connecting your Krafty account…
          </p>
        </>
      )}
    </div>
  )
}
