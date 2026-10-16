import assert from "node:assert/strict"
import test from "node:test"
import { createAppTools, type ApprovalGate } from "../lib/connector-tools"
import {
  EMAIL_CHANGED_ERROR,
  editEmailDraft,
  emailExecutionArguments,
  publicEmailDraft,
  stageEmailDraft,
} from "../lib/email-draft"
import { emailInput, emailTool } from "./helpers/email-draft"

const options = { toolCallId: "email", messages: [], context: {} }

test("the card contains the actual send content and edits preserve reply IDs", () => {
  const stored = stageEmailDraft(emailTool, emailInput, {
    from: "drew@example.com",
    inReplyTo: "Contract role from Ayesha",
  })!
  const draft = publicEmailDraft(stored)!
  assert.equal(draft.body, emailInput.body)
  assert.equal(draft.to, emailInput.recipient_email)
  const next = editEmailDraft(stored, draft.revision, {
    ...draft,
    to: "other@example.com",
    cc: "copy@example.com, second@example.com",
    body: "Edited\n\nThanks, Drew",
  })
  assert.deepEqual(emailExecutionArguments(next), {
    ...emailInput,
    recipient_email: "other@example.com",
    cc: ["copy@example.com", "second@example.com"],
    body: "Edited\n\nThanks, Drew",
  })
  assert.equal(publicEmailDraft(next)?.revision, 1)
  assert.throws(() => editEmailDraft(next, 0, draft), {
    message: EMAIL_CHANGED_ERROR,
  })
  assert.throws(() =>
    editEmailDraft(stored, 0, { ...draft, to: "not-an-email" })
  )
})

test("cards never hide HTML, MIME, attachments or unsupported sends", () => {
  assert.equal(
    stageEmailDraft(emailTool, { ...emailInput, is_html: true }),
    undefined
  )
  assert.equal(
    stageEmailDraft(emailTool, { ...emailInput, attachment: "file" }),
    undefined
  )
  assert.equal(
    stageEmailDraft({ ...emailTool, slug: "GMAIL_SEND_DRAFT" }, emailInput),
    undefined
  )
  assert.equal(
    stageEmailDraft({ ...emailTool, toolkit: "github" }, emailInput),
    undefined
  )
  assert.equal(publicEmailDraft(emailInput), undefined)
  assert.deepEqual(emailExecutionArguments(emailInput), emailInput)
})

test("preparing an email always holds the exact call, even with always-allow, without contacting Gmail", async () => {
  let held: Record<string, unknown> | undefined
  let calls = 0
  const gate: ApprovalGate = {
    required: async () => false,
    request: async (call) => {
      held = call.input
      return { approvalId: "email_1", summary: "Reply to Ayesha" }
    },
    claim: async () => undefined,
    complete: async () => {},
  }
  const tools = createAppTools(
    "alice",
    {
      accounts: async () => [{ id: "alice_gmail", toolkit: "gmail" }],
      schema: async () => emailTool,
      search: async () => ({ tools: [emailTool], guidance: {} }),
      execute: async () => {
        calls++
        return { resultType: "completed" }
      },
    },
    gate
  )
  await tools.getAppToolSchema.execute!({ slug: emailTool.slug }, options)
  const result = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        { slug: emailTool.slug, arguments: emailInput, prepareOnly: true },
        options
      )
    )
  )
  assert.equal(result.status, "approval_required")
  assert.equal(calls, 0)
  assert.deepEqual(emailExecutionArguments(held!), emailInput)
  assert.equal(publicEmailDraft(held!)?.body, emailInput.body)
  const unsupported = JSON.parse(
    String(
      await tools.executeAppTool.execute!(
        {
          slug: emailTool.slug,
          arguments: { ...emailInput, is_html: true },
          prepareOnly: true,
        },
        options
      )
    )
  )
  assert.equal(unsupported.code, "EMAIL_CARD_UNSUPPORTED")
  assert.equal(calls, 0)
})

test("Gmail thread replies keep their inherited subject and verified thread; nullable schema fields remain editable", () => {
  const reply = {
    ...emailTool,
    slug: "GMAIL_REPLY_TO_THREAD",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        recipient_email: { type: "string" },
        message_body: { type: "string" },
        thread_id: { type: "string" },
        cc: {
          anyOf: [
            { type: "array", items: { type: "string" } },
            { type: "null" },
          ],
        },
      },
      required: ["recipient_email", "message_body", "thread_id"],
    },
  }
  const args = {
    recipient_email: "ayesha@example.com",
    message_body: "Original reply",
    thread_id: "actual_thread",
  }
  assert.equal(stageEmailDraft(reply, args), undefined)
  const staged = stageEmailDraft(reply, args, { subject: "Re: Contract role" })!
  const draft = publicEmailDraft(staged)!
  assert.equal(draft.subject, "Re: Contract role")
  assert.ok(!draft.editable.includes("subject"))
  assert.ok(draft.editable.includes("cc"))
  const edited = editEmailDraft(staged, 0, {
    ...draft,
    body: "Edited reply",
    cc: "copy@example.com",
  })
  assert.deepEqual(emailExecutionArguments(edited), {
    ...args,
    message_body: "Edited reply",
    cc: ["copy@example.com"],
  })
  assert.throws(
    () => editEmailDraft(staged, 0, { ...draft, subject: "New topic" }),
    { message: EMAIL_CHANGED_ERROR }
  )
  assert.equal(
    stageEmailDraft(emailTool, {
      ...emailInput,
      extra_recipients: ["hidden@example.com"],
    }),
    undefined
  )
})
