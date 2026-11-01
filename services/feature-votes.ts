import { createHash } from "node:crypto"
import { count, eq } from "drizzle-orm"

import { db } from "@/db"
import { featureVotes, featureVoteSchema } from "@/db/schema"
import {
  summarizeFeatureVotes,
  voterTokenSchema,
  type FeatureVotes,
} from "@/lib/feature-votes"

// Intentionally public: anyone can vote without an account. The caller passes
// the browser's random cookie token and only its hash is stored. Clearing
// cookies allows another vote, so treat the tally as a signal, not a ballot.
const voterHash = (token: string) =>
  createHash("sha256").update(token).digest("hex")

export async function getFeatureVotes(
  voterToken: string | null
): Promise<FeatureVotes> {
  const rows = await db
    .select({ featureId: featureVotes.featureId, count: count() })
    .from(featureVotes)
    .groupBy(featureVotes.featureId)
  const token = voterTokenSchema.safeParse(voterToken)
  const [own] = token.success
    ? await db
        .select({ featureId: featureVotes.featureId })
        .from(featureVotes)
        .where(eq(featureVotes.voterHash, voterHash(token.data)))
    : []
  return summarizeFeatureVotes(rows, own?.featureId ?? null)
}

/** Records the voter's choice, replacing any earlier one, and returns the tally. */
export async function castFeatureVote(voterToken: string, input: unknown) {
  const token = voterTokenSchema.parse(voterToken)
  const { featureId } = featureVoteSchema.parse(input)
  await db
    .insert(featureVotes)
    .values({ voterHash: voterHash(token), featureId })
    .onConflictDoUpdate({
      target: featureVotes.voterHash,
      set: { featureId, updatedAt: new Date() },
    })
  return getFeatureVotes(token)
}
