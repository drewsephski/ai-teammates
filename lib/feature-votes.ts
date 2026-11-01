import { z } from "zod"

// The "what should we build next" poll on the home page. None of these exist
// yet: when one ships, take it off the ballot instead of leaving it to collect
// votes. Votes for a retired id stay in the table and are ignored here.
export const featureOptions = [
  {
    id: "messaging",
    title: "Message your Bots on WhatsApp and Telegram",
    detail: "Hand off a task from the chat app you already use.",
  },
  {
    id: "bot-email",
    title: "Give each Bot its own email address",
    detail: "Forward an email to a Bot and it gets to work.",
  },
  {
    id: "team",
    title: "Share Bots with your team",
    detail: "Invite coworkers to the same Bots, chats and approvals.",
  },
  {
    id: "extension",
    title: "A browser extension",
    detail: "Send a Bot the page you’re looking at.",
  },
] as const

export type FeatureId = (typeof featureOptions)[number]["id"]

export const featureIds = featureOptions.map((option) => option.id) as [
  FeatureId,
  ...FeatureId[],
]

/** The anonymous voter's cookie: 32 random bytes, base64url. */
export const FEATURE_VOTER_COOKIE = "krafty_voter"
export const voterTokenSchema = z.string().regex(/^[\w-]{43}$/)

export type FeatureVotes = {
  total: number
  counts: Record<FeatureId, number>
  choice: FeatureId | null
}

export type FeatureVoteResult =
  { ok: true; votes: FeatureVotes } | { ok: false; error: string }

const isFeatureId = (id: string | null | undefined): id is FeatureId =>
  featureIds.includes(id as FeatureId)

export function summarizeFeatureVotes(
  rows: { featureId: string; count: number }[],
  choice: string | null
): FeatureVotes {
  const counts = Object.fromEntries(featureIds.map((id) => [id, 0])) as Record<
    FeatureId,
    number
  >
  for (const row of rows)
    if (isFeatureId(row.featureId)) counts[row.featureId] += row.count
  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    choice: isFeatureId(choice) ? choice : null,
  }
}

/** Whole-number percentage of the vote, 0 when nobody has voted. */
export function voteShare(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0
}
