import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { forYouSourceRecords, isGroundedSuggestion } from "../lib/for-you"
import { signForYouToken, verifyForYouToken } from "../lib/for-you-token"

export const suggestion = {
  title: "Draft a launch reply",
  description: "Alex asked for your launch plan.",
  prompt:
    "Draft a reply to Alex about the Krafty launch plan for me to review.",
  botId: "quill",
  toolkit: "gmail",
  sourceId: "message_123",
  sourceQuote: "Krafty launch plan",
}
const read = {
  status: "succeeded",
  toolkit: "gmail",
  data: {
    emails: [
      { id: "message_123", subject: "Krafty launch plan" },
      { id: "message_other", subject: "Quarterly budget review" },
    ],
  },
}

test("For you requires an actual record and quote from a successful read of the same connected app", () => {
  assert.equal(isGroundedSuggestion(suggestion, [read]), true)
  for (const candidate of [
    { ...suggestion, sourceId: "invented" },
    { ...suggestion, sourceQuote: "Quarterly budget review" },
    { ...suggestion, toolkit: "slack" },
  ])
    assert.equal(isGroundedSuggestion(candidate, [read]), false)
  assert.equal(
    isGroundedSuggestion(suggestion, [{ ...read, status: "failed" }]),
    false
  )
  assert.equal(isGroundedSuggestion(suggestion, []), false)
})

test("Google Docs and Drive record identifiers ground quotes from the same record", () => {
  for (const key of ["document_id", "documentId", "file_id", "fileId"]) {
    const candidate = {
      ...suggestion,
      toolkit: "googledocs",
      sourceId: "doc_123",
      sourceQuote: "Launch checklist",
    }
    const records = [
      {
        status: "succeeded",
        toolkit: "googledocs",
        data: {
          [key]: "doc_123",
          title: "Launch checklist",
          plain_text: "Review the remaining launch tasks.",
        },
      },
    ]
    assert.equal(isGroundedSuggestion(candidate, records), true)
    assert.equal(
      isGroundedSuggestion({ ...candidate, sourceId: "other-doc" }, records),
      false
    )
  }
})

test("bounded formatting keeps later apps and complete records after large email reads", () => {
  const records = forYouSourceRecords([
    {
      status: "succeeded",
      toolkit: "gmail",
      data: {
        messages: Array.from({ length: 10 }, (_, i) => ({
          messageId: `email_${i}`,
          subject: "Routine notification",
          messageText: "Notification details. ".repeat(5000),
          payload: { encoded: "a".repeat(80_000) },
        })),
      },
    },
    {
      status: "succeeded",
      toolkit: "googledocs",
      data: {
        document_id: "doc_123",
        title: "Launch checklist",
        plain_text: "Review the remaining launch tasks.",
      },
    },
    {
      status: "failed",
      toolkit: "googledrive",
      data: { id: "failed", name: "Not verified" },
    },
  ])
  assert.ok(JSON.stringify(records).length <= 24_000)
  assert.ok(
    records.some(
      (record) =>
        record.toolkit === "googledocs" &&
        record.sourceId === "doc_123" &&
        record.text.includes("Launch checklist")
    )
  )
  assert.ok(!records.some((record) => record.sourceId === "failed"))
  assert.ok(!JSON.stringify(records).includes("encoded"))
})

test("task launch tokens bind the user, account, bot, prompt and expiry", () => {
  const value = {
    id: randomUUID(),
    userId: "alice",
    accountId: "alice-gmail",
    expiresAt: Date.now() + 60_000,
    suggestion,
  }
  const token = signForYouToken(value, "test-secret")
  assert.deepEqual(verifyForYouToken(token, "alice", "test-secret"), value)
  assert.throws(() => verifyForYouToken(token, "bob", "test-secret"))
  assert.throws(() => verifyForYouToken(token, "alice", "different-secret"))
  const [body, mac] = token.split(".")
  const tampered = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  tampered.suggestion.prompt = "Send money somewhere else"
  assert.throws(() =>
    verifyForYouToken(
      `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${mac}`,
      "alice",
      "test-secret"
    )
  )
  assert.throws(() =>
    verifyForYouToken(
      signForYouToken({ ...value, expiresAt: Date.now() - 1 }, "test-secret"),
      "alice",
      "test-secret"
    )
  )
})
