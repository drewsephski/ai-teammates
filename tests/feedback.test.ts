import assert from "node:assert/strict"
import { mock, test } from "node:test"

import {
  createFeedbackLimiter,
  FEEDBACK_RATE_LIMIT_ERROR,
  FEEDBACK_UNAVAILABLE_ERROR,
  feedbackInputSchema,
  feedbackIssue,
  parseFeedbackRepo,
} from "../lib/feedback"
import { submitFeedback, type FeedbackDeps } from "../services/feedback"

const now = new Date("2026-11-01T12:00:00Z")

function deps(overrides: Partial<FeedbackDeps> = {}): FeedbackDeps {
  return {
    fetch: async () => new Response("{}", { status: 201 }),
    token: "token",
    repo: "krafty/feedback",
    allow: () => true,
    now: () => now,
    report: () => {},
    ...overrides,
  }
}

test("feedback needs a message and trims it", () => {
  assert.throws(() => feedbackInputSchema.parse({ message: "   " }))
  assert.deepEqual(feedbackInputSchema.parse({ message: "  Hi  " }), {
    message: "Hi",
    source: "web",
  })
  assert.throws(() => feedbackInputSchema.parse({ message: "x".repeat(4001) }))
})

test("the repo must be owner/name", () => {
  assert.deepEqual(parseFeedbackRepo(" krafty/feedback "), {
    owner: "krafty",
    repo: "feedback",
  })
  assert.equal(parseFeedbackRepo("krafty"), null)
  assert.equal(parseFeedbackRepo("a/b/c"), null)
  assert.equal(parseFeedbackRepo(undefined), null)
})

test("an issue quotes the message, labels it and names only the account ID", () => {
  const issue = feedbackIssue(
    feedbackInputSchema.parse({
      message: `${"Long first line ".repeat(10)}\n# not a heading`,
      page: "/chats/`x`",
      source: "ios",
      appVersion: "1.4 (34)",
    }),
    { userId: "user_1", now }
  )
  assert.ok(issue.title.length <= "Feedback: ".length + 70)
  assert.ok(issue.title.endsWith("…"))
  assert.deepEqual(issue.labels, ["feedback"])
  assert.match(issue.body, /^> Long first line/)
  assert.match(issue.body, /\n> # not a heading\n/)
  assert.match(issue.body, /Account: `user_1`/)
  assert.match(issue.body, /Source: ios/)
  assert.match(issue.body, /App version: 1\.4 \(34\)/)
  assert.match(issue.body, /Page: `\/chats\/x`/)
  assert.doesNotMatch(issue.body, /@/)
})

test("the limiter allows five sends per person in ten minutes", () => {
  const allow = createFeedbackLimiter()
  for (let i = 0; i < 5; i++) assert.equal(allow("u", i), true)
  assert.equal(allow("u", 10), false)
  assert.equal(allow("other", 10), true)
  assert.equal(allow("u", 10 * 60 * 1000 + 1), true)
})

test("submitting files one labelled issue in the configured repo", async () => {
  const fetch = mock.fn(async () => new Response("{}", { status: 201 }))
  const result = await submitFeedback(
    "user_1",
    { message: "Love it" },
    deps({ fetch: fetch as unknown as typeof globalThis.fetch })
  )
  assert.deepEqual(result, { received: true })
  assert.equal(fetch.mock.callCount(), 1)
  const [url, init] = fetch.mock.calls[0].arguments as unknown as [
    string,
    RequestInit,
  ]
  assert.equal(url, "https://api.github.com/repos/krafty/feedback/issues")
  assert.equal(
    (init.headers as Record<string, string>).Authorization,
    "Bearer token"
  )
  const body = JSON.parse(init.body as string)
  assert.equal(body.title, "Feedback: Love it")
  assert.deepEqual(body.labels, ["feedback"])
})

test("without a token or repo, feedback points to the support email", async () => {
  for (const missing of [{ token: undefined }, { repo: "nope" }]) {
    await assert.rejects(
      submitFeedback("u", { message: "Hi" }, deps(missing)),
      { message: FEEDBACK_UNAVAILABLE_ERROR }
    )
  }
})

test("a GitHub failure is reported as the same retryable message", async () => {
  await assert.rejects(
    submitFeedback(
      "u",
      { message: "Hi" },
      deps({ fetch: async () => new Response("no", { status: 403 }) })
    ),
    { message: FEEDBACK_UNAVAILABLE_ERROR }
  )
})

test("too many sends are refused before calling GitHub", async () => {
  const fetch = mock.fn(async () => new Response("{}", { status: 201 }))
  await assert.rejects(
    submitFeedback(
      "u",
      { message: "Hi" },
      deps({
        allow: () => false,
        fetch: fetch as unknown as typeof globalThis.fetch,
      })
    ),
    { message: FEEDBACK_RATE_LIMIT_ERROR }
  )
  assert.equal(fetch.mock.callCount(), 0)
})
