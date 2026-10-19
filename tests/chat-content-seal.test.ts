import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import test from "node:test"

import {
  chatContentKeyBytes,
  isSealedMessage,
  newChatContentKey,
  openMessage,
  SEALED_PART_TYPE,
  sealInputRecord,
  sealMessage,
} from "../lib/chat-content-seal"

// What a person writes reaches Trigger.dev's input stream only as ciphertext
// under the chat's key, so deleting the key (with the chat) leaves Trigger.dev's
// copy unreadable.

const key = randomBytes(32)
const user = {
  id: "msg_1",
  role: "user",
  parts: [
    { type: "text", text: "My bank PIN is 4512" },
    { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAA" },
  ],
  metadata: { displayPrompt: "Private prompt", questionId: "call_1" },
}

test("a sealed message hides its parts and metadata, keeping id and role", () => {
  const sealed = sealMessage(user, "chat_1", key)
  assert.equal(sealed.id, "msg_1")
  assert.equal(sealed.role, "user")
  assert.equal(sealed.metadata, undefined)
  assert.deepEqual(
    sealed.parts?.map((part) => (part as { type: string }).type),
    [SEALED_PART_TYPE]
  )
  assert.doesNotMatch(JSON.stringify(sealed), /4512|Private prompt|AAA/)
  assert.ok(isSealedMessage(sealed))
  assert.deepEqual(openMessage(sealed, "chat_1", key), user)
})

test("each seal uses a fresh IV, and sealing twice is a no-op", () => {
  const a = sealMessage(user, "chat_1", key)
  const b = sealMessage(user, "chat_1", key)
  assert.notDeepEqual(a, b)
  assert.equal(sealMessage(a, "chat_1", key), a)
})

test("a message opens only with its own key, chat and message ID", () => {
  const sealed = sealMessage(user, "chat_1", key)
  assert.throws(() => openMessage(sealed, "chat_1", randomBytes(32)))
  assert.throws(() => openMessage(sealed, "chat_2", key))
  assert.throws(() => openMessage({ ...sealed, id: "msg_2" }, "chat_1", key))
})

test("tampered ciphertext is refused", () => {
  const sealed = sealMessage(user, "chat_1", key)
  const part = sealed.parts[0] as unknown as { data: { data: string } }
  const bytes = Buffer.from(part.data.data, "base64url")
  bytes[0] ^= 1
  const tampered = {
    ...sealed,
    parts: [
      { ...part, data: { ...part.data, data: bytes.toString("base64url") } },
    ],
  }
  assert.throws(() => openMessage(tampered, "chat_1", key))
})

test("only user messages are sealed, and unsealed ones open unchanged", () => {
  const assistant = {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "hi" }],
  }
  assert.equal(sealMessage(assistant, "chat_1", key), assistant)
  assert.equal(openMessage(user, "chat_1", key), user)
  assert.equal(isSealedMessage(user), false)
})

test("an input record's message is sealed and the rest of the record kept", () => {
  const body = JSON.stringify({
    kind: "message",
    payload: {
      chatId: "chat_1",
      trigger: "submit-message",
      messageId: "msg_1",
      message: user,
      metadata: { botId: "bot_1", mentions: [] },
    },
  })
  const sealed = sealInputRecord(body, "chat_1", key)!
  assert.doesNotMatch(sealed, /4512|Private prompt/)
  const record = JSON.parse(sealed)
  assert.equal(record.kind, "message")
  assert.equal(record.payload.trigger, "submit-message")
  assert.deepEqual(record.payload.metadata, { botId: "bot_1", mentions: [] })
  assert.deepEqual(openMessage(record.payload.message, "chat_1", key), user)
})

test("records without a message pass through; non-JSON is refused", () => {
  const stop = JSON.stringify({ kind: "stop" })
  assert.equal(sealInputRecord(stop, "chat_1", key), stop)
  const regenerate = JSON.stringify({
    kind: "message",
    payload: { chatId: "chat_1", trigger: "regenerate-message" },
  })
  assert.equal(sealInputRecord(regenerate, "chat_1", key), regenerate)
  assert.equal(sealInputRecord("not json", "chat_1", key), undefined)
  assert.equal(sealInputRecord("[1]", "chat_1", key), undefined)
})

test("keys are 32 random bytes in base64url", () => {
  const value = newChatContentKey()
  assert.equal(chatContentKeyBytes(value).length, 32)
  assert.notEqual(value, newChatContentKey())
  assert.throws(() => chatContentKeyBytes("short"))
})
