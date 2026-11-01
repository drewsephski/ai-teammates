import { z } from "zod"

import { supportEmail } from "@/lib/marketing/site"

// Beta feedback from the web and the app, filed as a GitHub issue labelled
// `feedback` (services/feedback.ts). Pure: no provider, database or Next import.

export const FEEDBACK_MAX_LENGTH = 4000

export const FEEDBACK_UNAVAILABLE_ERROR = `Couldn't send your feedback. Email ${supportEmail} instead.`
export const FEEDBACK_RATE_LIMIT_ERROR =
  "You've sent a lot of feedback just now. Try again in a few minutes."

export const feedbackSources = ["web", "ios", "android"] as const

export const feedbackInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Tell us what happened or what you'd like.")
    .max(
      FEEDBACK_MAX_LENGTH,
      `Keep it under ${FEEDBACK_MAX_LENGTH} characters.`
    ),
  // Where the person was, such as /chats/chat_123; never trusted for access
  page: z.string().trim().max(300).optional(),
  source: z.enum(feedbackSources).default("web"),
  appVersion: z.string().trim().max(40).optional(),
})

export type FeedbackInput = z.input<typeof feedbackInputSchema>
export type ParsedFeedback = z.output<typeof feedbackInputSchema>

// owner/name, as GITHUB_FEEDBACK_REPO holds it
export function parseFeedbackRepo(value: string | undefined) {
  const match = value?.trim().match(/^([\w.-]+)\/([\w.-]+)$/)
  return match ? { owner: match[1], repo: match[2] } : null
}

const TITLE_LENGTH = 70

// The issue a submission becomes. The account is named by its Clerk ID only,
// never an email, so the issue holds no more personal data than the person
// wrote themselves.
export function feedbackIssue(
  feedback: ParsedFeedback,
  { userId, now }: { userId: string; now: Date }
) {
  const firstLine = feedback.message.split(/\r?\n/, 1)[0].trim()
  const summary =
    firstLine.length > TITLE_LENGTH
      ? `${firstLine.slice(0, TITLE_LENGTH - 1).trimEnd()}…`
      : firstLine
  const details = [
    `- Account: \`${userId}\``,
    `- Source: ${feedback.source}`,
    feedback.appVersion && `- App version: ${feedback.appVersion}`,
    feedback.page && `- Page: \`${feedback.page.replace(/`/g, "")}\``,
    `- Sent: ${now.toISOString()}`,
  ].filter(Boolean)
  return {
    title: `Feedback: ${summary}`,
    // Quote the message so Markdown in it can't pose as our own text
    body: [
      feedback.message
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n"),
      "",
      ...details,
    ].join("\n"),
    labels: ["feedback"],
  }
}

// At most `limit` sends per person in `windowMs`, kept in memory. One Railway
// instance serves the app, so this is enough to stop a stuck button or a script
// from filing hundreds of issues.
export function createFeedbackLimiter({
  limit = 5,
  windowMs = 10 * 60 * 1000,
}: { limit?: number; windowMs?: number } = {}) {
  const sent = new Map<string, number[]>()
  return (userId: string, now = Date.now()) => {
    const recent = (sent.get(userId) ?? []).filter((at) => now - at < windowMs)
    if (recent.length >= limit) {
      sent.set(userId, recent)
      return false
    }
    recent.push(now)
    sent.set(userId, recent)
    return true
  }
}
