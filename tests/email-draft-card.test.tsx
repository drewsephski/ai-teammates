import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { EmailDraftCard } from "../components/email-draft-card"
import {
  publicEmailDraft,
  stageEmailDraft,
  type EmailDraftAction,
} from "../lib/email-draft"
import { emailInput, emailTool } from "./helpers/email-draft"

afterEach(cleanup)
const draft = publicEmailDraft(
  stageEmailDraft(emailTool, emailInput, {
    from: "drew@example.com",
    inReplyTo: "Contract role from Ayesha",
  })!
)!

test("an email is editable in chat and Send submits exactly the reviewed content", async () => {
  let sent: EmailDraftAction | undefined
  const view = render(
    <EmailDraftCard
      draft={draft}
      state="pending"
      onAction={async (input) => {
        sent = input
        return { woke: true }
      }}
    />
  )
  assert.equal(
    (view.getByLabelText("Email body") as HTMLTextAreaElement).value,
    emailInput.body
  )
  fireEvent.change(view.getByLabelText("Email body"), {
    target: { value: "My edited reply\n\nThanks, Drew" },
  })
  fireEvent.change(view.getByLabelText("To"), {
    target: { value: "new@example.com" },
  })
  fireEvent.click(view.getByRole("button", { name: /^Send$/ }))
  await waitFor(() => assert.equal(sent?.action, "send"))
  assert.equal(
    sent && "content" in sent && sent.content.body,
    "My edited reply\n\nThanks, Drew"
  )
  assert.equal(sent && "content" in sent && sent.content.to, "new@example.com")
})

test("Discard ignores invalid edits and a failed Send preserves all edits", async () => {
  let action: EmailDraftAction | undefined
  const view = render(
    <EmailDraftCard
      draft={draft}
      state="pending"
      onAction={async (input) => {
        action = input
        throw new Error("Offline. Your edits are still here.")
      }}
    />
  )
  fireEvent.change(view.getByLabelText("Email body"), {
    target: { value: "Keep my edit" },
  })
  fireEvent.click(view.getByRole("button", { name: /^Send$/ }))
  await waitFor(() =>
    assert.match(view.getByRole("alert").textContent!, /Offline/)
  )
  assert.equal(
    (view.getByLabelText("Email body") as HTMLTextAreaElement).value,
    "Keep my edit"
  )
  fireEvent.change(view.getByLabelText("To"), { target: { value: "" } })
  fireEvent.click(view.getByRole("button", { name: "Discard" }))
  await waitFor(() => assert.deepEqual(action, { action: "discard" }))
})

test("queued and uncertain sends never claim Sent or offer a duplicate send", () => {
  const view = render(
    <EmailDraftCard
      draft={draft}
      state="approved"
      onAction={async () => ({ woke: false })}
    />
  )
  assert.match(view.getByRole("status").textContent!, /Queued/)
  assert.equal(view.queryByRole("button", { name: /^Send$/ }), null)
  view.rerender(
    <EmailDraftCard
      draft={draft}
      state="failed"
      onAction={async () => ({ woke: true })}
    />
  )
  assert.match(view.getByRole("status").textContent!, /not confirmed/)
})
