import assert from "node:assert/strict"
import test from "node:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { checkComputerGesture } from "../lib/computer-guard"
import { autonomousLineupAllowed } from "../lib/fantasy-football-policy"

const teamUrl =
  "https://fantasy.espn.com/football/team?leagueId=123456&teamId=2&seasonId=2026"
const output = {
  target: "Start WR",
  impact: "high",
  category: "lineup",
  confidence: "high",
  injection: false,
  hostname: "fantasy.espn.com",
  pageUrl: teamUrl,
  reason: "An unlocked start/sit move",
}

function modelFor(value: unknown) {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "guard" },
          { type: "text-delta", id: "guard", delta: JSON.stringify(value) },
          { type: "text-end", id: "guard" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: {
                total: 20,
                noCache: 20,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: { total: 30, text: 30, reasoning: 0 },
            },
          },
        ],
      }),
    },
  })
}

const input = {
  screenshot: {
    base64: "AA==",
    mediaType: "image/png",
    width: 1024,
    height: 768,
  },
  gesture: {
    tool: "mouseClick" as const,
    x: 100,
    y: 200,
    button: "left",
    double: false,
  },
}

test("the real structured guard preserves a scoped lineup verdict and accounts for its model usage", async () => {
  const model = modelFor(output)
  let billed = 0
  const verdict = await checkComputerGesture({
    ...input,
    model,
    onUsage: async (usage) => {
      billed += usage.inputTokens ?? 0
    },
  })
  assert.equal(verdict.commits, true)
  assert.equal(verdict.pageUrl, teamUrl)
  assert.equal(
    autonomousLineupAllowed(
      { mode: "autonomous", enabled: true, teamUrl },
      verdict
    ),
    true
  )
  assert.equal(billed, 20)
  assert.equal(model.doGenerateCalls.length, 0)
})

test("an unreadable address cannot authorize an automatic move", async () => {
  const verdict = await checkComputerGesture({
    ...input,
    model: modelFor({ ...output, pageUrl: null }),
    onUsage: async () => {},
  })
  assert.equal(verdict.commits, true)
  assert.equal(
    autonomousLineupAllowed(
      { mode: "autonomous", enabled: true, teamUrl },
      verdict
    ),
    false
  )
})
