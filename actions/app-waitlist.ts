"use server"

import { after } from "next/server"
import { emailWaitlistSignup } from "@/lib/waitlist-notification"
import * as Sentry from "@sentry/nextjs"
import { appWaitlistSchema, type WaitlistResult } from "@/lib/app-waitlist"
import { joinAppWaitlist } from "@/services/app-waitlist"

// Public marketing form. Next's server-action origin check protects the POST;
// validation and a honeypot reject malformed or automated form submissions.
export async function joinWaitlist(input: unknown): Promise<WaitlistResult> {
  const parsed = appWaitlistSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and choose Mac or iPhone." }
  }
  try {
    const signups = await joinAppWaitlist(parsed.data)
    if (signups.length > 0) {
      after(async () => {
        try {
          await emailWaitlistSignup(signups)
        } catch {
          Sentry.captureException(
            new Error(
              "Waitlist owner notification failed; signup remains saved"
            )
          )
        }
      })
    }
    return { ok: true }
  } catch {
    // Do not send the submitted email or database query parameters to telemetry.
    Sentry.captureException(new Error("App waitlist signup failed"))
    return { ok: false, error: "Couldn't save your spot. Please try again." }
  }
}
