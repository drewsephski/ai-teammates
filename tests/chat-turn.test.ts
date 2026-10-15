import assert from "node:assert/strict"
import test from "node:test"
import { APICallError, RetryError } from "ai"

import { chatTurnState, isModelUnavailable } from "../lib/chat-turn"

// The Neon AI Gateway's over-capacity reply, as the agent saw it on 2026-10-15
const overCapacity = () =>
  new APICallError({
    message: "ai gateway upstream model is temporarily over capacity. Retry later",
    url: "https://gateway.example/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 503,
    responseBody:
      '{"error_code":"TEMPORARILY_UNAVAILABLE","message":"ai gateway upstream model is temporarily over capacity. Retry later"}',
    isRetryable: true,
  })

test("provider capacity errors are reported as a busy model", () => {
  assert.equal(isModelUnavailable(overCapacity()), true)
  // After the AI SDK's own retries are spent
  const exhausted = new RetryError({
    message: "Failed after 3 attempts",
    reason: "maxRetriesExceeded",
    errors: [overCapacity(), overCapacity(), overCapacity()],
  })
  assert.equal(isModelUnavailable(exhausted), true)
  const rateLimited = new APICallError({
    message: "Too many requests",
    url: "https://gateway.example",
    requestBodyValues: {},
    statusCode: 429,
  })
  assert.equal(isModelUnavailable(rateLimited), true)
})

test("request and application errors are not mistaken for a busy model", () => {
  const badRequest = new APICallError({
    message: "Invalid tool schema",
    url: "https://gateway.example",
    requestBodyValues: {},
    statusCode: 400,
    responseBody: '{"error":"invalid_request"}',
  })
  for (const error of [
    badRequest,
    new Error("You've used up your AI allowance."),
    new Error("503"),
    "over capacity",
    null,
    undefined,
  ])
    assert.equal(isModelUnavailable(error), false)
})

test("run statuses map to what a waiting client should be told", () => {
  assert.equal(chatTurnState(undefined), "idle")
  assert.equal(chatTurnState("COMPLETED"), "idle")
  assert.equal(chatTurnState("PENDING_VERSION"), "pending_version")
  for (const status of ["QUEUED", "DELAYED", "DEQUEUED"])
    assert.equal(chatTurnState(status), "queued")
  for (const status of ["EXECUTING", "WAITING"])
    assert.equal(chatTurnState(status), "running")
  for (const status of [
    "EXPIRED",
    "CANCELED",
    "FAILED",
    "CRASHED",
    "SYSTEM_FAILURE",
    "TIMED_OUT",
  ])
    assert.equal(chatTurnState(status), "ended")
})
