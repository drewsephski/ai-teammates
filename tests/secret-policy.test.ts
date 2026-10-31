import assert from "node:assert/strict"
import test from "node:test"

import {
  isReservedSecretName,
  redactSecrets,
  SECRET_NAME_PATTERN,
  secretLabelSchema,
  secretNameSchema,
  secretValueSchema,
} from "../lib/secret-policy"

const message = (result: {
  success: boolean
  error?: { issues: { message: string }[] }
}) => result.error?.issues[0]?.message

test("key names are environment-variable style", () => {
  for (const name of ["OPENAI_API_KEY", "GH_TOKEN", "A1", `A${"B".repeat(63)}`])
    assert.match(name, SECRET_NAME_PATTERN, name)
  for (const name of [
    "A",
    "openai_key",
    "1KEY",
    "_KEY",
    "MY-KEY",
    "MY KEY",
    `A${"B".repeat(64)}`,
  ])
    assert.doesNotMatch(name, SECRET_NAME_PATTERN, name)
  assert.equal(secretNameSchema.parse("  STRIPE_KEY "), "STRIPE_KEY")
  assert.equal(
    message(secretNameSchema.safeParse("stripe")),
    "Use capital letters, digits and underscores, like OPENAI_API_KEY."
  )
})

test("names the computer uses are reserved", () => {
  for (const name of [
    "PATH",
    "HOME",
    "LD_PRELOAD",
    "BASH_ENV",
    "NODE_OPTIONS",
    "PS4",
    "E2B_API_KEY",
    "E2B_ANYTHING",
    "LC_ALL",
  ]) {
    assert.equal(isReservedSecretName(name), true, name)
    assert.equal(
      message(secretNameSchema.safeParse(name)),
      "That name is used by the computer. Pick another.",
      name
    )
  }
  for (const name of ["OPENAI_API_KEY", "PATHS", "HOMEPAGE_TOKEN", "E2BKEY"])
    assert.equal(isReservedSecretName(name), false, name)
})

test("labels and values are trimmed and bounded", () => {
  assert.equal(secretLabelSchema.parse("  OpenAI "), "OpenAI")
  assert.equal(message(secretLabelSchema.safeParse("  ")), "Name this key.")
  assert.equal(secretLabelSchema.safeParse("a".repeat(81)).success, false)
  assert.equal(secretValueSchema.parse("  sk-abc\n"), "sk-abc")
  assert.equal(message(secretValueSchema.safeParse(" \n")), "Paste the key.")
  assert.equal(secretValueSchema.safeParse("a".repeat(8192)).success, true)
  assert.equal(
    message(secretValueSchema.safeParse("a".repeat(8193))),
    "That key is too long."
  )
})

test("redaction replaces every occurrence with the key's name", () => {
  const secrets = { OPENAI_API_KEY: "sk-live-123456", GH_TOKEN: "ghp_abcdef" }
  assert.equal(
    redactSecrets(
      "key=sk-live-123456 again sk-live-123456\ntoken ghp_abcdef",
      secrets
    ),
    "key=[secret OPENAI_API_KEY] again [secret OPENAI_API_KEY]\ntoken [secret GH_TOKEN]"
  )
  assert.equal(redactSecrets("nothing here", secrets), "nothing here")
  assert.equal(redactSecrets("", secrets), "")
})

test("redaction replaces longer values first and skips short ones", () => {
  // The short value is inside the long one: the long one wins
  assert.equal(
    redactSecrets("x abcdef-ghijkl y abcdef", {
      SHORT: "abcdef",
      LONG: "abcdef-ghijkl",
    }),
    "x [secret LONG] y [secret SHORT]"
  )
  // Too short to redact without mangling ordinary output
  assert.equal(
    redactSecrets("yes 12345 yes", { PIN: "12345" }),
    "yes 12345 yes"
  )
  // Values are literal text, not patterns
  assert.equal(
    redactSecrets("a.b*c+d? and axbxcxd", { WEIRD: "a.b*c+d?" }),
    "[secret WEIRD] and axbxcxd"
  )
})
