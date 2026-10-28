"use server"

import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import * as Sentry from "@sentry/nextjs"

import { featureVoteSchema } from "@/db/schema"
import {
  FEATURE_VOTER_COOKIE,
  voterTokenSchema,
  type FeatureVoteResult,
} from "@/lib/feature-votes"
import { castFeatureVote } from "@/services/feature-votes"

// Public home page poll, no sign-in. Next's server-action origin check
// protects the POST; the voter is identified only by a random cookie.
export async function voteForFeature(
  featureId: unknown
): Promise<FeatureVoteResult> {
  const parsed = featureVoteSchema.safeParse({ featureId })
  if (!parsed.success) return { ok: false, error: "Choose one of the options." }

  const store = await cookies()
  const existing = store.get(FEATURE_VOTER_COOKIE)?.value
  const token = voterTokenSchema.safeParse(existing).success
    ? existing!
    : randomBytes(32).toString("base64url")
  try {
    const votes = await castFeatureVote(token, parsed.data)
    if (token !== existing) {
      store.set(FEATURE_VOTER_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      })
    }
    return { ok: true, votes }
  } catch (error) {
    Sentry.captureException(error)
    return { ok: false, error: "Couldn't save your vote. Try again." }
  }
}
