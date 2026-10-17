import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"

// The approval rows themselves: computer approvals are bound to their bot and
// chat and spent within a short window; "Always allow" never covers a
// high-risk or computer action and is bound to its account; a declined app
// call isn't asked again; another account's rules can't be read or removed.
// In-memory Postgres; the dispatcher is a fake, so no bot is woken.

const A = "user_a"
const B = "user_b"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let lib: typeof import("../lib/approvals")
let service: typeof import("../services/approvals")

const posted: { chatId: string; id: string; text: string }[] = []
const dispatch = (async (
  chatId: string,
  message: { id: string; text: string }
) => {
  posted.push({ chatId, ...message })
}) as never

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  lib = await import("../lib/approvals")
  service = await import("../services/approvals")
  await db.insert(schema.bots).values([
    { id: "bot_a1", userId: A, name: "Quill", job: "Writer" },
    { id: "bot_a2", userId: A, name: "Ledger", job: "Books" },
    { id: "bot_b1", userId: B, name: "Scout", job: "Research" },
  ])
  await db.insert(schema.chats).values([
    { id: "chat_a1", userId: A, kind: "direct" },
    { id: "chat_a2", userId: A, kind: "direct" },
    { id: "chat_b1", userId: B, kind: "direct" },
  ])
})
after(async () => {
  await database?.stop()
})

async function computerApproval(patch: Record<string, unknown> = {}) {
  const row = await lib.requestApproval({
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    kind: "computer",
    toolkit: "computer",
    toolSlug: "COMPUTER_SUBMIT",
    accountId: "computer",
    arguments: { hostname: "school.example.com", action: "submit" },
    summary: "Submit 24 grades for Period 3",
    hostname: "school.example.com",
    action: "submit",
  })
  if (Object.keys(patch).length)
    await db
      .update(schema.approvals)
      .set(patch)
      .where(eq(schema.approvals.id, row.id))
  return row.id
}

test("a computer approval is spent by its bot in its chat, within its window", async () => {
  const id = await computerApproval()
  // Pending: nothing to spend
  assert.equal(
    await lib.spendComputerApproval(A, "bot_a1", "chat_a1", id),
    false
  )
  await lib.decideApproval(A, id, "approve", undefined, dispatch)
  // Another bot, another chat, another account
  assert.equal(
    await lib.spendComputerApproval(A, "bot_a2", "chat_a1", id),
    false
  )
  assert.equal(
    await lib.spendComputerApproval(A, "bot_a1", "chat_a2", id),
    false
  )
  assert.equal(
    await lib.spendComputerApproval(B, "bot_a1", "chat_a1", id),
    false
  )
  // Three steps, then it's used up
  for (let i = 0; i < 3; i++)
    assert.equal(
      await lib.spendComputerApproval(A, "bot_a1", "chat_a1", id),
      true
    )
  assert.equal(
    await lib.spendComputerApproval(A, "bot_a1", "chat_a1", id),
    false
  )
  await lib.completeComputerApproval(id, { ok: true, result: { step: 1 } })
  await lib.completeComputerApproval(id, { ok: false, result: { step: 2 } })
  const [row] = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.id, id))
  // One success keeps it executed; every outcome is kept for the record
  assert.equal(row.state, "executed")
  assert.equal((row.result as unknown[]).length, 2)
  // The app path can never spend a computer approval
  assert.equal(await lib.claimApproval(A, "bot_a1", id), undefined)
})

test("a window that closed, or an approval decided long ago, can't be spent", async () => {
  const closed = await computerApproval({
    state: "running",
    claimedAt: new Date(Date.now() - 120_000),
    uses: 1,
  })
  assert.equal(
    await lib.spendComputerApproval(A, "bot_a1", "chat_a1", closed),
    false
  )
  const old = await computerApproval({
    state: "approved",
    decidedAt: new Date(Date.now() - 2 * 3_600_000),
  })
  assert.equal(
    await lib.spendComputerApproval(A, "bot_a1", "chat_a1", old),
    false
  )
})

test("Always allow on a computer or high-risk approval approves once and saves no rule", async () => {
  posted.length = 0
  const id = await computerApproval()
  await lib.decideApproval(A, id, "always", undefined, dispatch)
  const email = await lib.requestApproval({
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "gmail",
    toolSlug: "GMAIL_SEND_EMAIL",
    accountId: "ca_gmail",
    arguments: { to: "sam@example.com" },
    summary: "Email Sam",
  })
  await lib.decideApproval(A, email.id, "always", undefined, dispatch)
  assert.deepEqual(await lib.listApprovalRules(A), [])
  // The bot is told it was a plain approval, and the computer one to look first
  assert.doesNotMatch(posted[0].text, /always allow/i)
  assert.match(posted[0].text, /viewScreen first/)
  assert.doesNotMatch(posted[1].text, /always allow/i)
})

test("a low-risk rule is bound to its account and can be revoked only by its owner", async () => {
  const row = await lib.requestApproval({
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "notion",
    toolSlug: "NOTION_UPDATE_PAGE",
    accountId: "ca_notion_1",
    arguments: { page: "p1" },
    summary: "Update the plan page",
  })
  await lib.decideApproval(A, row.id, "always", undefined, dispatch)
  assert.equal(
    await lib.hasApprovalRule("bot_a1", "NOTION_UPDATE_PAGE", "ca_notion_1"),
    true
  )
  assert.equal(
    await lib.hasApprovalRule("bot_a1", "NOTION_UPDATE_PAGE", "ca_notion_2"),
    false
  )
  assert.equal(
    await lib.hasApprovalRule("bot_a2", "NOTION_UPDATE_PAGE", "ca_notion_1"),
    false
  )
  // A destructive tag on the same slug outranks the rule
  assert.equal(
    await lib.hasApprovalRule("bot_a1", "NOTION_UPDATE_PAGE", "ca_notion_1", [
      "destructiveHint",
    ]),
    false
  )
  assert.deepEqual(
    (await service.listApprovalRules(A)).map((rule) => rule.toolSlug),
    ["NOTION_UPDATE_PAGE"]
  )
  assert.deepEqual(await service.listApprovalRules(B), [])
  await assert.rejects(
    service.revokeApprovalRule(B, {
      botId: "bot_a1",
      toolSlug: "NOTION_UPDATE_PAGE",
    }),
    /Rule not found/
  )
  await service.revokeApprovalRule(A, {
    botId: "bot_a1",
    toolSlug: "NOTION_UPDATE_PAGE",
  })
  assert.equal(
    await lib.hasApprovalRule("bot_a1", "NOTION_UPDATE_PAGE", "ca_notion_1"),
    false
  )
})

test("a declined app call isn't asked again unchanged, and the decline is read from the database", async () => {
  const call = {
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "slack",
    toolSlug: "SLACK_SEND_MESSAGE",
    accountId: "ca_slack",
    arguments: { channel: "general", text: "hi all" },
    summary: "Post in #general",
  }
  const first = await lib.requestApproval(call)
  await lib.decideApproval(A, first.id, "deny", undefined, dispatch)
  await assert.rejects(lib.requestApproval(call), /declined this exact request/)
  // A changed request gets a new card
  await lib.requestApproval({
    ...call,
    arguments: { channel: "general", text: "hi team" },
  })
  assert.deepEqual(await lib.declinedFor(A, first.id), [
    { kind: "app", toolkit: "slack" },
  ])
  // Another account's ID, or one that wasn't declined, locks nothing
  assert.deepEqual(await lib.declinedFor(B, first.id), [])
  const approved = await computerApproval()
  await lib.decideApproval(
    A,
    approved.toString(),
    "approve",
    undefined,
    dispatch
  )
  assert.deepEqual(await lib.declinedFor(A, approved), [])
})

test("app approvals are claimed only from the chat that asked", async () => {
  const row = await lib.requestApproval({
    userId: A,
    botId: "bot_a1",
    chatId: "chat_a1",
    toolkit: "github",
    toolSlug: "GITHUB_CREATE_AN_ISSUE",
    accountId: "ca_gh",
    arguments: { title: "Bug" },
    summary: "Open an issue",
  })
  await lib.decideApproval(A, row.id, "approve", undefined, dispatch)
  assert.equal(
    await lib.claimApproval(A, "bot_a1", row.id, "chat_a2"),
    undefined
  )
  assert.equal(
    (await lib.claimApproval(A, "bot_a1", row.id, "chat_a1"))?.id,
    row.id
  )
  assert.equal(
    await lib.claimApproval(A, "bot_a1", row.id, "chat_a1"),
    undefined
  )
})

test("approvals expose kind, site and whether Always allow can save a rule", async () => {
  const id = await computerApproval({ preview: "data:image/png;base64,AAAA" })
  const detail = await service.getApproval(A, id)
  assert.equal(detail.kind, "computer")
  assert.equal(detail.hostname, "school.example.com")
  assert.equal(detail.action, "submit")
  assert.equal(detail.alwaysAllowed, false)
  assert.equal(detail.preview, "data:image/png;base64,AAAA")
  const pending = await service.listPendingApprovals(A)
  const listed = pending.find((approval) => approval.id === id)
  assert.equal(listed?.alwaysAllowed, false)
  // The list stays small: no screenshots in it
  assert.equal("preview" in (listed ?? {}), false)
})

test("several held computer steps in one chat stop new requests", async () => {
  await db.delete(schema.approvals)
  for (let i = 0; i < 3; i++) await computerApproval()
  await assert.rejects(computerApproval(), /already waiting/)
})
