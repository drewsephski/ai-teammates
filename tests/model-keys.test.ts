import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// Bring your own model on in-memory Postgres: keys are checked against a fake
// provider, sealed, selected one at a time and never returned. No network.

const OWNER = "user_owner"
const OTHER = "user_other"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let lib: typeof import("../lib/model-keys")
let provider: typeof import("../lib/ai-provider")
let policy: typeof import("../lib/model-key-policy")

// A provider that knows one key and lists two models
function fakeProvider(validKey = "sk-ant-good-1234") {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url: String(url), headers })
    if (headers["x-api-key"] !== validKey)
      return new Response("{}", { status: 401 })
    return Response.json({
      data: [
        { id: "claude-good", display_name: "Claude Good" },
        { id: "claude-fast", display_name: "Claude Fast" },
      ],
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

before(async () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = "ab".repeat(32)
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  lib = await import("../lib/model-keys")
  provider = await import("../lib/ai-provider")
  policy = await import("../lib/model-key-policy")
  await db.insert(schema.chatgptConnections).values({
    userId: OWNER,
    issuer: "https://auth.openai.com",
    clientId: "oaiapp_test",
    subject: "sub",
    enabled: true,
  })
})

after(async () => {
  await database?.stop()
})

test("a rejected key or a model it can't use is never saved", async () => {
  const { fetchImpl } = fakeProvider()
  await assert.rejects(
    lib.saveModelKey(
      OWNER,
      { provider: "anthropic", apiKey: "sk-ant-wrong", model: "claude-good" },
      fetchImpl
    ),
    { message: policy.MODEL_KEY_REJECTED_ERROR }
  )
  await assert.rejects(
    lib.saveModelKey(
      OWNER,
      { provider: "anthropic", apiKey: "sk-ant-good-1234", model: "gpt-9" },
      fetchImpl
    ),
    { message: policy.MODEL_NOT_OFFERED_ERROR }
  )
  assert.deepEqual(await lib.listModelKeys(OWNER), [])
})

test("a saved key is sealed, selected, and replaces the ChatGPT plan", async () => {
  const { fetchImpl } = fakeProvider()
  assert.equal(await provider.usesOwnModel(OTHER), false)
  const keys = await lib.saveModelKey(
    OWNER,
    {
      provider: "anthropic",
      apiKey: " sk-ant-good-1234 ",
      model: "claude-good",
    },
    fetchImpl
  )
  assert.deepEqual(
    keys.map(({ provider, keyHint, model, selected }) => ({
      provider,
      keyHint,
      model,
      selected,
    })),
    [
      {
        provider: "anthropic",
        keyHint: "1234",
        model: "claude-good",
        selected: true,
      },
    ]
  )
  assert.equal("apiKey" in keys[0], false)
  const [row] = await db
    .select()
    .from(schema.modelKeys)
    .where(eq(schema.modelKeys.userId, OWNER))
  assert.doesNotMatch(row.apiKey, /sk-ant-good/)
  const [chatgpt] = await db
    .select({ enabled: schema.chatgptConnections.enabled })
    .from(schema.chatgptConnections)
    .where(eq(schema.chatgptConnections.userId, OWNER))
  assert.equal(chatgpt.enabled, false)

  assert.equal(await provider.usesOwnModel(OWNER), true)
  const reply = await provider.replyModelForUser(OWNER)
  assert.equal(reply.kind, "key")
  assert.equal(reply.kind === "key" && reply.provider, "anthropic")
  assert.equal((await provider.replyModelForUser(OTHER)).kind, "krafty")
})

test("the model changes without pasting the key again", async () => {
  const { fetchImpl, calls } = fakeProvider()
  const models = await lib.listProviderModels(
    OWNER,
    { provider: "anthropic" },
    fetchImpl
  )
  assert.deepEqual(
    models.map((model) => model.id),
    ["claude-good", "claude-fast"]
  )
  // The saved key was opened and sent, not anything from the request
  assert.equal(calls[0].headers["x-api-key"], "sk-ant-good-1234")
  const keys = await lib.saveModelKey(
    OWNER,
    { provider: "anthropic", model: "claude-fast" },
    fetchImpl
  )
  assert.equal(keys[0].model, "claude-fast")
  // Another account has no saved key to reuse
  await assert.rejects(
    lib.listProviderModels(OTHER, { provider: "anthropic" }, fetchImpl),
    { message: policy.MODEL_KEY_MISSING_ERROR }
  )
})

test("a sealed key only opens for the account and provider it was saved for", async () => {
  const [row] = await db
    .select()
    .from(schema.modelKeys)
    .where(eq(schema.modelKeys.userId, OWNER))
  await db.insert(schema.modelKeys).values({ ...row, userId: OTHER })
  await assert.rejects(
    lib.listProviderModels(
      OTHER,
      { provider: "anthropic" },
      fakeProvider().fetchImpl
    )
  )
  await db.delete(schema.modelKeys).where(eq(schema.modelKeys.userId, OTHER))
})

test("switching back to Krafty, or to a key that isn't saved", async () => {
  await assert.rejects(lib.selectAIProvider(OWNER, "google"), {
    message: policy.MODEL_KEY_MISSING_ERROR,
  })
  // Still on the saved key
  assert.equal(await provider.usesOwnModel(OWNER), true)
  const keys = await lib.selectAIProvider(OWNER, "krafty")
  assert.equal(keys[0].selected, false)
  assert.equal(await provider.usesOwnModel(OWNER), false)
  await lib.selectAIProvider(OWNER, "anthropic")
  assert.equal(await provider.usesOwnModel(OWNER), true)
  // Turning on the ChatGPT plan deselects keys
  await lib.deselectModelKeys(OWNER)
  assert.equal((await lib.listModelKeys(OWNER))[0].selected, false)
})

test("keys are removed only by their owner", async () => {
  const service = await import("../services/model-keys")
  await assert.rejects(
    service.deleteModelKey(OTHER, "anthropic"),
    /Key not found/
  )
  await assert.rejects(
    service.deleteModelKey(OWNER, "nonsense"),
    /Key not found/
  )
  assert.deepEqual(await service.deleteModelKey(OWNER, "anthropic"), [])
})

test("without an encryption key nothing is saved", async () => {
  const saved = process.env.CREDENTIAL_ENCRYPTION_KEY
  delete process.env.CREDENTIAL_ENCRYPTION_KEY
  try {
    await assert.rejects(
      lib.saveModelKey(
        OWNER,
        {
          provider: "anthropic",
          apiKey: "sk-ant-good-1234",
          model: "claude-good",
        },
        fakeProvider().fetchImpl
      ),
      { message: policy.MODEL_KEY_UNAVAILABLE_ERROR }
    )
  } finally {
    process.env.CREDENTIAL_ENCRYPTION_KEY = saved
  }
})

test("an unreachable provider is the provider's failure, not a bad key", async () => {
  const down = (async () => {
    throw new TypeError("fetch failed")
  }) as typeof fetch
  await assert.rejects(
    lib.fetchProviderModels("openai", "sk-x", down),
    /^Error: Couldn't reach OpenAI\. Try again\.$/
  )
  const failing = (async () =>
    new Response("{}", { status: 500 })) as typeof fetch
  await assert.rejects(
    lib.fetchProviderModels("openai", "sk-x", failing),
    /Couldn't reach OpenAI/
  )
  // OpenRouter checks the key on its own first
  const openrouter = (async (url: string) =>
    String(url).endsWith("/key")
      ? new Response("{}", { status: 401 })
      : Response.json({ data: [] })) as typeof fetch
  await assert.rejects(
    lib.fetchProviderModels("openrouter", "sk-or", openrouter),
    { message: policy.MODEL_KEY_REJECTED_ERROR }
  )
})
