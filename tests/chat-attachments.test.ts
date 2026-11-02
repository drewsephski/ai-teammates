import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"
import { convertToModelMessages } from "ai"
import { startTestDatabase } from "./helpers/test-db"
import {
  attachmentUrl,
  MAX_ATTACHMENT_BYTES,
  validAttachmentBytes,
} from "../lib/chat-attachment-policy"
import { readChatAttachment } from "../lib/chat-attachment-upload"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let attachments: typeof import("../lib/chat-attachments")
let context: typeof import("../services/chat-attachments")
before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  attachments = await import("../lib/chat-attachments")
  context = await import("../services/chat-attachments")
  await db.insert(schema.chats).values([
    { id: "a", userId: "alice" },
    { id: "a2", userId: "alice", name: "Project brief" },
    { id: "b", userId: "bob" },
  ])
})
after(async () => database?.stop())
const bytes = Buffer.from("Private project requirements")
const upload = () =>
  attachments.storeChatAttachment("alice", "a", {
    filename: "brief.txt",
    mediaType: "text/plain",
    bytes,
  })

test("uploads are encrypted, scoped to the owner and chat, and hydrate real SDK messages", async () => {
  const file = await upload()
  const [stored] = await db
    .select()
    .from(schema.chatAttachments)
    .where(eq(schema.chatAttachments.id, file.id))
  assert.equal(JSON.stringify(stored).includes(bytes.toString("base64")), false)
  assert.equal(JSON.stringify(stored).includes(bytes.toString()), false)
  const read = await attachments.readStoredAttachment("alice", "a", file.id)
  assert.deepEqual(read.bytes, bytes)
  await assert.rejects(
    attachments.readStoredAttachment("bob", "a", file.id),
    /Chat not found/
  )
  await assert.rejects(
    attachments.readStoredAttachment("alice", "a2", file.id),
    /Attachment not found/
  )
  const messages = await convertToModelMessages([
    {
      role: "user",
      parts: [
        {
          type: "file",
          filename: file.filename,
          mediaType: file.mediaType,
          url: file.url,
        },
      ],
    },
  ])
  const hydrated = await attachments.hydrateChatAttachments(
    "alice",
    "a",
    messages
  )
  assert.match(JSON.stringify(hydrated), /Private project requirements/)
  assert.equal(
    JSON.stringify(messages).includes("Private project requirements"),
    false
  )
  await attachments.discardChatAttachment("alice", "a", file.id)
  await assert.rejects(
    attachments.readStoredAttachment("alice", "a", file.id),
    /Attachment not found/
  )
})

test("PDF bytes reach the model instead of an authenticated URL or filename", async () => {
  const pdf = Buffer.from("%PDF-1.7\nfixture")
  const file = await attachments.storeChatAttachment("alice", "a", {
    filename: "report.pdf",
    mediaType: "application/pdf",
    bytes: pdf,
  })
  const messages = await convertToModelMessages([
    {
      role: "user",
      parts: [
        {
          type: "file",
          filename: file.filename,
          mediaType: file.mediaType,
          url: file.url,
        },
      ],
    },
  ])
  const hydrated = await attachments.hydrateChatAttachments(
    "alice",
    "a",
    messages
  )
  assert.match(JSON.stringify(hydrated), new RegExp(pdf.toString("base64")))
  assert.equal(JSON.stringify(hydrated).includes(file.url), false)
  await assert.rejects(
    attachments.hydrateChatAttachments("bob", "b", messages),
    /Attachment not found/
  )
})

test("missing, cross-chat, excessive and arbitrary remote file references fail closed", async () => {
  await assert.rejects(
    attachments.hydrateChatAttachments("alice", "a", [
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: "application/pdf",
            data: { type: "url", url: new URL(attachmentUrl("missing")) },
          },
        ],
      },
    ]),
    /Attachment not found/
  )
  await assert.rejects(
    attachments.hydrateChatAttachments("alice", "a", [
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: "application/pdf",
            data: { type: "url", url: new URL("http://127.0.0.1/private") },
          },
        ],
      },
    ]),
    /Use an uploaded/
  )
  const file = await upload()
  await assert.rejects(
    attachments.hydrateChatAttachments("alice", "a", [
      {
        role: "user",
        content: Array.from({ length: 6 }, () => ({
          type: "file" as const,
          mediaType: "text/plain",
          data: { type: "url" as const, url: new URL(file.url) },
        })),
      },
    ]),
    /Too many attachments/
  )
})

test("conversation context is an owner-checked snapshot of text, without tool output", async () => {
  await db.insert(schema.chatTranscripts).values({
    chatId: "a2",
    entries: [
      {
        id: "u",
        final: true,
        message: {
          id: "u",
          role: "user",
          parts: [
            { type: "text", text: "The launch is Friday" },
            { type: "tool-secret", output: "private tool payload" },
          ],
        },
      },
    ],
  })
  const file = await context.attachConversation("alice", "a", "a2")
  const read = await attachments.readStoredAttachment("alice", "a", file.id)
  assert.match(read.bytes.toString(), /launch is Friday/)
  assert.doesNotMatch(read.bytes.toString(), /private tool payload/)
  await assert.rejects(
    context.attachConversation("alice", "a", "b"),
    /Chat not found/
  )
  await assert.rejects(
    context.attachConversation("alice", "a", "a"),
    /no messages/
  )
  // Once sent, an attachment cannot be removed by draft cleanup.
  await db.insert(schema.chatTranscripts).values({
    chatId: "a",
    entries: [{ message: { parts: [{ type: "file", url: file.url }] } }],
  })
  await assert.rejects(
    attachments.discardChatAttachment("alice", "a", file.id),
    /already part of a message/
  )
})

test("bounded binary reader enforces actual bytes, MIME signatures, names, and the exact 10 MB boundary", async () => {
  const request = (body: Uint8Array, type = "text/plain", name = "brief.txt") =>
    new Request("https://kraftybot.app", {
      method: "POST",
      headers: {
        "content-type": type,
        "x-file-name": encodeURIComponent(name),
      },
      body: body as BodyInit,
    })
  const full = Buffer.alloc(MAX_ATTACHMENT_BYTES, 65)
  assert.equal(
    (await readChatAttachment(request(full))).bytes.length,
    MAX_ATTACHMENT_BYTES
  )
  await assert.rejects(
    readChatAttachment(request(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))),
    /10 MB/
  )
  await assert.rejects(
    readChatAttachment(request(Buffer.from("not a PDF"), "application/pdf")),
    /contents/
  )
  await assert.rejects(
    readChatAttachment(request(bytes, "text/plain", "../secret.txt"))
  )
  await assert.rejects(readChatAttachment(request(bytes, "text/html")))
  assert.equal(validAttachmentBytes(Buffer.alloc(0), "text/plain"), false)
  assert.equal(
    validAttachmentBytes(Buffer.from([0xff, 0xff]), "text/plain"),
    false
  )
})

test("deleting a chat cascades its files and content key", async () => {
  const file = await attachments.storeChatAttachment("bob", "b", {
    filename: "note.txt",
    mediaType: "text/plain",
    bytes,
  })
  await db.delete(schema.chats).where(eq(schema.chats.id, "b"))
  assert.deepEqual(
    await db
      .select()
      .from(schema.chatAttachments)
      .where(eq(schema.chatAttachments.id, file.id)),
    []
  )
  assert.deepEqual(
    await db
      .select()
      .from(schema.chatContentKeys)
      .where(eq(schema.chatContentKeys.chatId, "b")),
    []
  )
})

test("quota checks serialize concurrent uploads and reclaim only abandoned old drafts", async () => {
  await db.insert(schema.chats).values({ id: "quota", userId: "alice" })
  await db.insert(schema.chatAttachments).values(
    Array.from({ length: 99 }, (_, i) => ({
      id: `quota-${i}`,
      chatId: "quota",
      filename: "fixture.txt",
      mediaType: "text/plain",
      size: 1,
      sealed: [],
    }))
  )
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      attachments.storeChatAttachment("alice", "quota", {
        filename: "new.txt",
        mediaType: "text/plain",
        bytes,
      })
    )
  )
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1
  )
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000)
  await db
    .update(schema.chatAttachments)
    .set({ createdAt: old })
    .where(eq(schema.chatAttachments.chatId, "quota"))
  await db.insert(schema.chatTranscripts).values({
    chatId: "quota",
    entries: [
      {
        message: { parts: [{ type: "file", url: attachmentUrl("quota-0") }] },
      },
    ],
  })
  await attachments.storeChatAttachment("alice", "quota", {
    filename: "next.txt",
    mediaType: "text/plain",
    bytes,
  })
  const remaining = await db
    .select()
    .from(schema.chatAttachments)
    .where(eq(schema.chatAttachments.chatId, "quota"))
  assert.equal(remaining.length, 2)
  assert.ok(remaining.some((file) => file.id === "quota-0"))
})
