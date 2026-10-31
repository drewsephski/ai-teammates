import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// A throwaway key for this process only; tests run without environment files
process.env.CHATGPT_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex")

const A = "user_a"
const B = "user_b"
const VALUE = "sk-test-0123456789abcdef"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let secrets: typeof import("../lib/user-secrets")
let service: typeof import("../services/secrets")

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  secrets = await import("../lib/user-secrets")
  service = await import("../services/secrets")
})

after(async () => {
  await database?.stop()
})

test("encryption round-trips and is bound to the owner and the name", () => {
  const ciphertext = secrets.encryptUserSecret(VALUE, A, "OPENAI_API_KEY")
  assert.match(ciphertext, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
  assert.ok(!ciphertext.includes(VALUE))
  assert.equal(
    secrets.decryptUserSecret(ciphertext, A, "OPENAI_API_KEY"),
    VALUE
  )
  // Fresh IV each time
  assert.notEqual(
    secrets.encryptUserSecret(VALUE, A, "OPENAI_API_KEY"),
    ciphertext
  )
  // Moved to another account or another name, it no longer opens
  assert.throws(() =>
    secrets.decryptUserSecret(ciphertext, B, "OPENAI_API_KEY")
  )
  assert.throws(() => secrets.decryptUserSecret(ciphertext, A, "GH_TOKEN"))
  // Nor under another key
  assert.throws(() =>
    secrets.decryptUserSecret(ciphertext, A, "OPENAI_API_KEY", randomBytes(32))
  )
  const [version, iv, tag, data] = ciphertext.split(".")
  const flipped = Buffer.from(data, "base64url")
  flipped[0] ^= 1
  assert.throws(() =>
    secrets.decryptUserSecret(
      [version, iv, tag, flipped.toString("base64url")].join("."),
      A,
      "OPENAI_API_KEY"
    )
  )
})

test("a missing or malformed key configuration refuses to save", () => {
  const saved = process.env.CHATGPT_TOKEN_ENCRYPTION_KEY
  try {
    for (const value of [undefined, "not-hex", "ab".repeat(16)]) {
      if (value === undefined) delete process.env.CHATGPT_TOKEN_ENCRYPTION_KEY
      else process.env.CHATGPT_TOKEN_ENCRYPTION_KEY = value
      assert.throws(
        () => secrets.encryptUserSecret(VALUE, A, "OPENAI_API_KEY"),
        /^Error: Couldn't save the key$/
      )
    }
  } finally {
    process.env.CHATGPT_TOKEN_ENCRYPTION_KEY = saved
  }
})

test("saving stores ciphertext, replacing keeps createdAt, and nothing returns the value", async () => {
  const first = await secrets.storeUserSecret(A, {
    name: "OPENAI_API_KEY",
    label: "OpenAI",
    value: `  ${VALUE}\n`,
  })
  assert.deepEqual(Object.keys(first).sort(), [
    "createdAt",
    "label",
    "name",
    "updatedAt",
  ])
  const [row] = await db
    .select()
    .from(schema.userSecrets)
    .where(eq(schema.userSecrets.userId, A))
  assert.ok(!row.ciphertext.includes(VALUE))
  // Trimmed before it was encrypted
  assert.equal(
    secrets.decryptUserSecret(row.ciphertext, A, "OPENAI_API_KEY"),
    VALUE
  )

  await new Promise((resolve) => setTimeout(resolve, 5))
  const replaced = await secrets.storeUserSecret(A, {
    name: "OPENAI_API_KEY",
    label: "OpenAI (work)",
    value: "sk-test-replaced-value",
  })
  assert.equal(replaced.label, "OpenAI (work)")
  assert.deepEqual(replaced.createdAt, first.createdAt)
  assert.ok(replaced.updatedAt > first.updatedAt)
  const rows = await db
    .select()
    .from(schema.userSecrets)
    .where(eq(schema.userSecrets.userId, A))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, row.id)

  await secrets.storeUserSecret(A, {
    name: "GH_TOKEN",
    label: "GitHub",
    value: "ghp_test_token_value",
  })
  // The same name is a separate key for another account
  await secrets.storeUserSecret(B, {
    name: "OPENAI_API_KEY",
    label: "B's OpenAI",
    value: "sk-test-b-value-123",
  })
  const listed = await secrets.listUserSecretNames(A)
  assert.deepEqual(
    listed.map((secret) => [secret.name, secret.label]),
    [
      ["GH_TOKEN", "GitHub"],
      ["OPENAI_API_KEY", "OpenAI (work)"],
    ]
  )
  assert.doesNotMatch(JSON.stringify(listed), /sk-test|ghp_test|v1\./)
  assert.equal(await secrets.hasUserSecret(A, "GH_TOKEN"), true)
  assert.equal(await secrets.hasUserSecret(A, "MISSING_KEY"), false)
  assert.equal(await secrets.hasUserSecret(B, "GH_TOKEN"), false)
})

test("invalid input never reaches the database", async () => {
  await assert.rejects(
    secrets.storeUserSecret(A, { name: "PATH", label: "Path", value: VALUE }),
    /used by the computer/
  )
  assert.equal(await secrets.hasUserSecret(A, "PATH"), false)
})

test("the bash environment decrypts every key and skips one that won't open", async () => {
  assert.deepEqual(await secrets.loadUserSecretEnv(A), {
    GH_TOKEN: "ghp_test_token_value",
    OPENAI_API_KEY: "sk-test-replaced-value",
  })
  assert.deepEqual(await secrets.loadUserSecretEnv(B), {
    OPENAI_API_KEY: "sk-test-b-value-123",
  })
  assert.deepEqual(await secrets.loadUserSecretEnv("user_nobody"), {})

  // B's ciphertext copied onto A's row fails A's binding and is skipped
  const [bRow] = await db
    .select()
    .from(schema.userSecrets)
    .where(eq(schema.userSecrets.userId, B))
  await db.insert(schema.userSecrets).values({
    userId: A,
    name: "STOLEN_KEY",
    label: "Copied",
    ciphertext: bRow.ciphertext,
  })
  assert.deepEqual(Object.keys(await secrets.loadUserSecretEnv(A)).sort(), [
    "GH_TOKEN",
    "OPENAI_API_KEY",
  ])
  assert.equal(await secrets.removeUserSecret(A, "STOLEN_KEY"), true)
  assert.equal(await secrets.removeUserSecret(A, "STOLEN_KEY"), false)
})

test("saving from a key card wakes the bot that asked with the name, never the value", async () => {
  const woken: unknown[] = []
  const wake = async (userId: string, attempt: unknown) => {
    woken.push({ userId, attempt })
    return { woke: true, inputSeq: 7 }
  }
  const result = await service.saveSecret(
    A,
    {
      name: "STRIPE_KEY",
      label: "Stripe",
      value: "sk_test_stripe_value",
      chatId: "chat_a1",
      botId: "bot_a1",
      questionId: "call_1",
    },
    { wake }
  )
  assert.equal(result.secret.name, "STRIPE_KEY")
  assert.equal(result.woke, true)
  assert.equal(result.inputSeq, 7)
  assert.deepEqual(woken, [
    {
      userId: A,
      attempt: {
        chatId: "chat_a1",
        botId: "bot_a1",
        questionId: "call_1",
        name: "STRIPE_KEY",
        label: "Stripe",
      },
    },
  ])
  assert.doesNotMatch(JSON.stringify(result), /sk_test_stripe/)

  // From /workspace: no chat, no wake
  woken.length = 0
  const plain = await service.saveSecret(
    A,
    { name: "STRIPE_KEY", label: "Stripe", value: "sk_test_stripe_other" },
    { wake }
  )
  assert.deepEqual(Object.keys(plain), ["secret"])
  assert.deepEqual(woken, [])

  assert.deepEqual(
    (await service.listSecrets(A)).map((secret) => secret.name),
    ["GH_TOKEN", "OPENAI_API_KEY", "STRIPE_KEY"]
  )
  await service.deleteSecret(A, "STRIPE_KEY")
  await assert.rejects(
    service.deleteSecret(A, "STRIPE_KEY"),
    /^Error: Key not found$/
  )
})

test("the wake names the key and is an attended turn", async () => {
  const { secretWakeMessageId, secretWakePrompt } =
    await import("../lib/secret-wake")
  const { unattendedOrigin } = await import("../lib/routine-policy")
  assert.equal(secretWakeMessageId("call_1"), "secret_call_1")
  assert.equal(unattendedOrigin(secretWakeMessageId("call_1")), undefined)
  const prompt = secretWakePrompt("OPENAI_API_KEY", "OpenAI")
  assert.match(prompt, /saved OpenAI from the key card/)
  assert.match(prompt, /\$OPENAI_API_KEY in every bash command/)
  assert.match(prompt, /Never print, echo, log or write its value\./)
})
