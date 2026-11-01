import * as Sentry from "@sentry/nextjs"

import {
  createFeedbackLimiter,
  FEEDBACK_RATE_LIMIT_ERROR,
  FEEDBACK_UNAVAILABLE_ERROR,
  feedbackInputSchema,
  feedbackIssue,
  parseFeedbackRepo,
  type FeedbackInput,
} from "@/lib/feedback"

const allowSend = createFeedbackLimiter()

export type FeedbackDeps = {
  fetch: typeof fetch
  token: string | undefined
  // owner/name. Point it at a private repository: feedback can hold personal
  // details, and this app's own repository is public.
  repo: string | undefined
  allow: (userId: string) => boolean
  now: () => Date
  report: (error: unknown) => void
}

const defaultDeps = (): FeedbackDeps => ({
  fetch: globalThis.fetch,
  token: process.env.GITHUB_FEEDBACK_TOKEN,
  repo: process.env.GITHUB_FEEDBACK_REPO,
  allow: allowSend,
  now: () => new Date(),
  report: (error) => Sentry.captureException(error),
})

// Files the person's feedback as a GitHub issue labelled `feedback`
export async function submitFeedback(
  userId: string,
  input: FeedbackInput,
  deps: FeedbackDeps = defaultDeps()
) {
  const feedback = feedbackInputSchema.parse(input)
  const target = parseFeedbackRepo(deps.repo)
  const token = deps.token?.trim()
  if (!target || !token) {
    deps.report(new Error("Feedback isn't configured"))
    throw new Error(FEEDBACK_UNAVAILABLE_ERROR)
  }
  if (!deps.allow(userId)) throw new Error(FEEDBACK_RATE_LIMIT_ERROR)

  const issue = feedbackIssue(feedback, { userId, now: deps.now() })
  try {
    const response = await deps.fetch(
      `https://api.github.com/repos/${target.owner}/${target.repo}/issues`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(issue),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!response.ok)
      throw new Error(`GitHub answered ${response.status} to a feedback issue`)
  } catch (error) {
    deps.report(error)
    throw new Error(FEEDBACK_UNAVAILABLE_ERROR)
  }
  return { received: true as const }
}
