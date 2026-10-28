import { cookies } from "next/headers"
import * as Sentry from "@sentry/nextjs"

import { FEATURE_VOTER_COOKIE, type FeatureVotes } from "@/lib/feature-votes"
import { getFeatureVotes } from "@/services/feature-votes"

/**
 * The poll tally and this browser's vote, or null when the database is
 * unreachable, so the home page still renders the options without counts.
 */
export async function loadFeatureVotes(): Promise<FeatureVotes | null> {
  const token = (await cookies()).get(FEATURE_VOTER_COOKIE)?.value ?? null
  try {
    return await getFeatureVotes(token)
  } catch (error) {
    Sentry.captureException(error)
    return null
  }
}
