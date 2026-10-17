import assert from "node:assert/strict"
import { test } from "node:test"

import {
  isOwnModelError,
  keyHint,
  modelListRequest,
  ownModelErrorMessage,
  parseModelList,
} from "../lib/model-key-policy"

test("each provider's model list request carries the key its way", () => {
  assert.deepEqual(modelListRequest("anthropic", "sk-ant").headers, {
    "x-api-key": "sk-ant",
    "anthropic-version": "2023-06-01",
  })
  assert.equal(
    modelListRequest("openai", "sk-o").headers.Authorization,
    "Bearer sk-o"
  )
  assert.equal(modelListRequest("google", "g").headers["x-goog-api-key"], "g")
  // OpenRouter's list is public, so the key is checked on its own
  assert.equal(
    modelListRequest("openrouter", "or").keyCheckUrl,
    "https://openrouter.ai/api/v1/key"
  )
})

test("only chat models that can call tools are offered", () => {
  assert.deepEqual(
    parseModelList("openai", {
      data: [
        { id: "gpt-5" },
        { id: "gpt-4o-realtime-preview" },
        { id: "text-embedding-3-large" },
        { id: "o4-mini" },
        { id: "dall-e-3" },
        { id: "gpt-5" },
      ],
    }).map((model) => model.id),
    ["o4-mini", "gpt-5"]
  )
  assert.deepEqual(
    parseModelList("google", {
      models: [
        {
          name: "models/gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"],
        },
      ],
    }),
    [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]
  )
  assert.deepEqual(
    parseModelList("openrouter", {
      data: [
        { id: "a/tools", name: "Tools", supported_parameters: ["tools"] },
        { id: "b/plain", name: "Plain", supported_parameters: ["temperature"] },
      ],
    }),
    [{ id: "a/tools", name: "Tools" }]
  )
  assert.deepEqual(
    parseModelList("anthropic", {
      data: [{ id: "claude-x", display_name: "Claude X" }],
    }),
    [{ id: "claude-x", name: "Claude X" }]
  )
  assert.deepEqual(parseModelList("anthropic", "garbage"), [])
})

test("errors from the person's own provider name it and say Krafty wasn't charged", () => {
  const rejected = ownModelErrorMessage("anthropic", 401)
  assert.match(rejected, /^Your Anthropic key was rejected/)
  assert.match(
    ownModelErrorMessage("openai", 429),
    /out of credit or rate limited/
  )
  assert.match(
    ownModelErrorMessage("google", 404),
    /doesn't offer the chosen model/
  )
  assert.match(
    ownModelErrorMessage("openrouter", 500),
    /couldn't complete this reply/
  )
  for (const status of [401, 402, 404, 500, undefined])
    assert.ok(isOwnModelError(ownModelErrorMessage("openai", status)))
  assert.equal(isOwnModelError("Something went wrong"), false)
  assert.equal(keyHint("  sk-abc-1234 "), "1234")
})
