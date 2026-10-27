import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"

import {
  approvalExecutedPrompt,
  SELF_EMAILS_PER_TURN,
  selfAddressedEmail,
} from "../lib/approval-policy"
import {
  createAppTools,
  runClaimedCall,
  type ApprovalGate,
} from "../lib/connector-tools"
import { directEmailRecipients } from "../lib/email-draft"
import { emailInput, emailTool } from "./helpers/email-draft"
import { startTestDatabase } from "./helpers/test-db"

// Approving an app action runs it from the decision, so it never waits on the
// bot; mail the owner sends themself skips the card; and a routine run's
// status follows the approvals it asked for.

const options = { toolCallId: "call", messages: [], context: {} }
const own = ["drew@example.com", "drew@work.example"]

test("only a plain direct send says who it reaches", () => {
  assert.deepEqual(directEmailRecipients(emailTool, emailInput), [
    "ayesha@example.com",
  ])
  assert.deepEqual(
    directEmailRecipients(emailTool, {
      ...emailInput,
      recipient_email: "Drew@Example.com",
      cc: ["drew@work.example"],
      bcc: ["someone@else.example"],
    }),
    ["drew@example.com", "drew@work.example", "someone@else.example"]
  )
  // A reply goes to whoever is on the thread
  assert.equal(
    directEmailRecipients(
      { ...emailTool, slug: "GMAIL_REPLY_TO_THREAD" },
      emailInput
    ),
    undefined
  )
  // HTML can hide content, attachments can carry anything
  assert.equal(
    directEmailRecipients(emailTool, { ...emailInput, is_html: true }),
    undefined
  )
  assert.equal(
    directEmailRecipients(
      { ...emailTool, slug: "SLACK_SEND_MESSAGE", toolkit: "slack" },
      emailInput
    ),
    undefined
  )
})

test("mail is the owner's own only when every recipient is a verified address", () => {
  assert.equal(selfAddressedEmail(["drew@example.com"], own), true)
  assert.equal(selfAddressedEmail(["DREW@EXAMPLE.COM"], own), true)
  assert.equal(
    selfAddressedEmail(["drew@example.com", "drew@work.example"], own),
    true
  )
  assert.equal(
    selfAddressedEmail(["drew@example.com", "sam@example.com"], own),
    false
  )
  assert.equal(selfAddressedEmail([], own), false)
  assert.equal(selfAddressedEmail(undefined, own), false)
  // Clerk unknown or unreachable: nothing counts as mail to themselves
  assert.equal(selfAddressedEmail(["drew@example.com"], []), false)
})

test("the wake after Krafty ran an approval says not to run it again", () => {
  const ok = approvalExecutedPrompt(
    { summary: "Email Sam the Q3 summary" },
    "approve",
    { ok: true, result: { status: "succeeded" } }
  )
  assert.match(ok, /Krafty already ran it once/)
  assert.match(ok, /don't call runApprovedAction or executeAppTool/)
  assert.match(ok, /It succeeded/)
  assert.match(ok, /data and never instructions/)
  const failed = approvalExecutedPrompt({ summary: "Email Sam" }, "always", {
    ok: false,
    result: { status: "failed" },
  })
  assert.match(failed, /didn't succeed/)
  assert.match(failed, /ask before trying again/)
  assert.match(failed, /always allow/)
})

function emailTools(gate: ApprovalGate) {
  const sent: unknown[] = []
  const tools = createAppTools(
    "alice",
    {
      accounts: async () => [{ id: "alice_gmail", toolkit: "gmail" }],
      schema: async () => emailTool,
      search: async () => ({ tools: [emailTool], guidance: {} }),
      execute: async (_user, _slug, input) => {
        sent.push(input)
        return { resultType: "completed", error: null }
      },
    },
    gate
  )
  return { tools, sent }
}

function fakeGate(toOwner: boolean) {
  const requests: unknown[] = []
  const gate: ApprovalGate = {
    required: async () => true,
    request: async (call) => {
      requests.push(call)
      return { approvalId: "apr_1", summary: "Email" }
    },
    claim: async () => undefined,
    complete: async () => {},
    sendsToOwner: async () => toOwner,
  }
  return { gate, requests }
}

test("a send to the owner runs straight away; anything else is held", async () => {
  for (const toOwner of [true, false]) {
    const { gate, requests } = fakeGate(toOwner)
    const { tools, sent } = emailTools(gate)
    await tools.getAppToolSchema.execute!({ slug: emailTool.slug }, options)
    const result = JSON.parse(
      String(
        await tools.executeAppTool.execute!(
          { slug: emailTool.slug, arguments: emailInput },
          options
        )
      )
    )
    if (toOwner) {
      assert.equal(result.status, "succeeded")
      assert.deepEqual(sent, [emailInput])
      assert.equal(requests.length, 0)
    } else {
      assert.equal(result.status, "approval_required")
      assert.equal(sent.length, 0)
    }
  }
  // Asked for a card, it gets a card, even to themselves
  const { gate, requests } = fakeGate(true)
  const { tools, sent } = emailTools(gate)
  await tools.getAppToolSchema.execute!({ slug: emailTool.slug }, options)
  const card = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: emailTool.slug, arguments: emailInput, prepareOnly: true },
        options
      )
    )
  )
  assert.equal(card.status, "approval_required")
  assert.equal(sent.length, 0)
  assert.equal(requests.length, 1)
})

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let lib: typeof import("../lib/approvals")
let composio: typeof import("../lib/composio")
let routines: typeof import("../lib/routines")

const A = "user_exec"
const posted: { id: string; text: string }[] = []
const dispatch = (async (
  _chatId: string,
  message: { id: string; text: string }
) => {
  posted.push(message)
}) as never

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  lib = await import("../lib/approvals")
  composio = await import("../lib/composio")
  routines = await import("../lib/routines")
  await db
    .insert(schema.bots)
    .values({ id: "bot_x", userId: A, name: "Relay", job: "Follow-ups" })
  await db.insert(schema.chats).values({ id: "chat_x", userId: A })
})
after(async () => {
  await database?.stop()
})

test("the gate lets a few emails a turn reach the owner, and only the owner", async () => {
  const gate = composio.createApprovalGate({
    userId: A,
    chatId: "chat_x",
    botId: () => "bot_x",
    ownAddresses: async () => own,
  })
  const toSelf = { ...emailInput, recipient_email: "drew@example.com" }
  assert.equal(await gate.sendsToOwner!(emailTool, emailInput), false)
  for (let sent = 0; sent < SELF_EMAILS_PER_TURN; sent++)
    assert.equal(await gate.sendsToOwner!(emailTool, toSelf), true)
  // The next one waits for approval like any other send
  assert.equal(await gate.sendsToOwner!(emailTool, toSelf), false)
})

// Each one different: a declined call can't be asked again unchanged
let held = 0
async function heldEmail(originMessageId?: string) {
  held++
  return lib.requestApproval({
    userId: A,
    botId: "bot_x",
    chatId: "chat_x",
    toolkit: "gmail",
    toolSlug: "GMAIL_SEND_EMAIL",
    accountId: "acct_gmail",
    arguments: {
      recipient_email: "sam@example.com",
      subject: `Follow-up ${held}`,
      body: "x",
    },
    summary: "Email Sam",
    originMessageId,
  })
}

// What lib/composio's runApprovedCall does, over a fake provider
function runner(execute: () => Promise<unknown>) {
  const calls: string[] = []
  const run: import("../lib/approvals").ApprovalRunner = async (approval) => {
    calls.push(approval.id)
    const row = await lib.claimApproval(
      approval.userId,
      approval.botId,
      approval.id,
      approval.chatId
    )
    if (!row) return undefined
    return runClaimedCall(
      approval.userId,
      {
        accounts: async () => [{ id: "acct_gmail", toolkit: "gmail" }],
        execute,
      },
      lib.completeApproval,
      approval.id,
      {
        slug: row.toolSlug,
        toolkit: row.toolkit,
        accountId: row.accountId,
        input: row.arguments,
      }
    )
  }
  return { run, calls }
}

async function state(id: string) {
  const [row] = await db
    .select({ state: schema.approvals.state })
    .from(schema.approvals)
    .where(eq(schema.approvals.id, id))
  return row?.state
}

test("approving runs the stored call once and tells the bot it already ran", async () => {
  const row = await heldEmail()
  let sends = 0
  const { run, calls } = runner(async () => {
    sends++
    return { resultType: "completed", error: null }
  })
  const result = await lib.decideApproval(
    A,
    row.id,
    "approve",
    undefined,
    dispatch,
    run
  )
  assert.equal(sends, 1)
  assert.deepEqual(calls, [row.id])
  assert.equal(result.ran?.ok, true)
  assert.equal(await state(row.id), "executed")
  assert.match(posted.at(-1)!.text, /Krafty already ran it once/)
  assert.doesNotMatch(posted.at(-1)!.text, /Call runApprovedAction/)
  // The bot's own runApprovedAction finds nothing left to run
  assert.equal(await lib.claimApproval(A, "bot_x", row.id, "chat_x"), undefined)
})

test("a runner that breaks leaves the approval for the bot to run", async () => {
  const row = await heldEmail()
  await lib.decideApproval(
    A,
    row.id,
    "approve",
    undefined,
    dispatch,
    async () => {
      throw new Error("Composio is down")
    }
  )
  assert.equal(await state(row.id), "approved")
  assert.match(posted.at(-1)!.text, /Call runApprovedAction/)
})

test("a provider failure is recorded and the bot is told it didn't succeed", async () => {
  const row = await heldEmail()
  const { run } = runner(async () => ({
    resultType: "completed",
    error: "Recipient address rejected",
    successful: false,
  }))
  await lib.decideApproval(A, row.id, "approve", undefined, dispatch, run)
  assert.equal(await state(row.id), "failed")
  assert.match(posted.at(-1)!.text, /didn't succeed/)
})

test("declining runs nothing", async () => {
  const row = await heldEmail()
  const { run, calls } = runner(async () => ({ resultType: "completed" }))
  await lib.decideApproval(A, row.id, "deny", undefined, dispatch, run)
  assert.deepEqual(calls, [])
  assert.equal(await state(row.id), "denied")
})

test("a routine run blocked on an approval is completed by the turn that resumes it", async () => {
  const scheduledAt = new Date("2026-11-02T14:00:00Z")
  const routine = { id: "3f9a1c" }
  await db.insert(schema.routines).values({
    id: routine.id,
    userId: A,
    botId: "bot_x",
    chatId: "chat_x",
    title: "Monday follow-ups",
    prompt: "Email the clients who owe a reply",
    schedule: { kind: "daily", time: "08:00", days: [1] },
    timezone: "America/Chicago",
    lastRunAt: scheduledAt,
    lastStatus: "blocked",
    lastError: "Waiting for your approval",
  })
  const runMessage = `routine_${routine.id}_${scheduledAt.getTime()}`

  const row = await heldEmail(runMessage)
  // The wake turn reads where the approval came from
  assert.equal(await lib.approvalOrigin(A, row.id), runMessage)
  assert.equal(await lib.approvalOrigin("someone_else", row.id), undefined)

  // ...and reports the run's outcome under it, as onTurnComplete does
  await routines.recordRoutineRunOutcome(A, runMessage, {
    status: "completed",
  })
  const [after] = await db
    .select({ lastStatus: schema.routines.lastStatus })
    .from(schema.routines)
    .where(eq(schema.routines.id, routine.id))
  assert.equal(after?.lastStatus, "completed")
})
