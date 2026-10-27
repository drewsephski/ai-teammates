import "./helpers/avatar-motion"
import "./helpers/css.mjs"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react"
const { DemoApproval } =
  await import("../components/landing/bot/chat-demo-approval")
import {
  demoAgents,
  heroEntries,
} from "../components/landing/bot/chat-demo-data"

afterEach(cleanup)

test("demo conversations show product cards without making every bot wait", () => {
  for (const agent of demoAgents.filter((agent) => agent.id !== "new-bot")) {
    const entries = agent.id === "sales-outbound" ? heroEntries : agent.entries
    if (agent.id !== "talent-scout")
      assert.ok(
        entries.some(
          (entry) => entry.kind === "approval" || entry.kind === "email"
        ),
        agent.id
      )
    assert.ok(entries.every((entry) => !entry.text.includes("→")))
  }
})

test("approval decisions and reset work locally with the real product card", async () => {
  const entry = heroEntries.find((entry) => entry.kind === "approval")!
  const view = await act(async () => render(<DemoApproval entry={entry} />))
  await waitFor(() => view.getByRole("button", { name: "Approve" }))
  assert.equal(view.queryByRole("button", { name: "Always allow" }), null)
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Approve" }))
  })
  assert.ok(
    view.getByRole("button", { name: /Approve/ }).hasAttribute("disabled")
  )
  assert.ok(view.getByText("Working…"))
  await waitFor(() => view.getByText("Approved and done"))
  assert.ok(
    view.getByText(
      "Sent the 10 approved messages. The other 26 drafts are still on hold."
    )
  )
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Reset example" }))
  })
  await waitFor(() => view.getByRole("button", { name: "Decline" }))
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Decline" }))
  })
  await waitFor(() => view.getByText("Declined"))
})

const { DemoSetup } = await import("../components/landing/bot/chat-demo-setup")

test("setup waits for a role and explicit confirmation before naming the bot", async () => {
  const names: string[] = []
  const view = await act(async () =>
    render(<DemoSetup onName={(name) => names.push(name)} />)
  )
  await waitFor(() => view.getByText("What should I help with?"))
  await act(async () => {
    fireEvent.click(view.getByText("Writing and editing"))
  })
  assert.ok(view.getByText("Thinking…"))
  assert.equal(view.queryByText("Save this?"), null)
  await waitFor(() => view.getByText("Save this?"), { timeout: 2000 })
  assert.deepEqual(names, [])
  await act(async () => {
    fireEvent.click(view.getByText("Change something"))
  })
  await waitFor(() => view.getByText("What should I help with?"))
  await act(async () => {
    fireEvent.click(view.getByText("Research and decisions"))
  })
  await waitFor(() => view.getByText("Save this?"), { timeout: 2000 })
  await act(async () => {
    fireEvent.click(view.getByText("Save it"))
  })
  assert.ok(view.getByText("Working…"))
  assert.notEqual(names.at(-1), "Researcher")
  await waitFor(() => view.getByText("Configured as Researcher"), {
    timeout: 2000,
  })
  assert.equal(names.at(-1), "Researcher")
  assert.ok(view.getByText("Configured as Researcher"))
  assert.equal(view.queryByText("Explore the Sales Outbound example"), null)
  assert.ok(view.getByText("What should we start with?"))
  await act(async () => {
    fireEvent.click(view.getByText("Compare two vendor quotes"))
  })
  assert.ok(view.getByText("Thinking…"))
  await waitFor(() => view.getByRole("button", { name: "Send" }), {
    timeout: 2500,
  })
  assert.ok(view.getByText(/Acme is \$12 per seat/))
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  })
  await waitFor(() => view.getByText("Sent to dana@acme.example."), {
    timeout: 2000,
  })
})

test("email approval shows the product sending state and prevents a second send", async () => {
  const entry = demoAgents
    .find((agent) => agent.id === "inbox-manager")!
    .entries.find((entry) => entry.kind === "email")!
  const view = await act(async () =>
    render(<DemoApproval entry={entry} name="Inbox Manager" />)
  )
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  })
  await waitFor(() => view.getByText("Sending · awaiting confirmation"))
  assert.equal(view.queryByRole("button", { name: /Send/ }), null)
  assert.ok(
    view.getByRole("button", { name: "Reset example" }).hasAttribute("disabled")
  )
  await waitFor(() => view.getByText("Sent"), { timeout: 2000 })
  assert.ok(view.getByText("Sent to dana@acme.example."))
  assert.equal(view.queryByRole("button", { name: "Send" }), null)
})

const { useDemoInbox, pendingDemoDecisions } =
  await import("../components/landing/bot/chat-demo-inbox")

test("reading clears unread while pending approvals stay, and background results become unread", () => {
  const { result } = renderHook(() => useDemoInbox())
  const inbox = demoAgents.find((agent) => agent.id === "inbox-manager")!
  const approvalIndex = inbox.entries.findIndex(
    (entry) => entry.kind === "approval"
  )
  assert.equal(result.current.unread[inbox.id], true)
  act(() => result.current.selectChat(inbox.id))
  assert.equal(result.current.unread[inbox.id], false)
  assert.equal(
    pendingDemoDecisions(inbox.id, inbox.entries, result.current.decisions),
    2
  )
  act(() => result.current.selectChat("chief-of-staff"))
  assert.equal(result.current.unread[inbox.id], false)
  act(() =>
    result.current.recordDecision(`${inbox.id}:${approvalIndex}`, "executed")
  )
  assert.equal(result.current.unread[inbox.id], true)
  assert.equal(
    pendingDemoDecisions(inbox.id, inbox.entries, result.current.decisions),
    1
  )
  act(() => result.current.selectChat(inbox.id))
  assert.equal(result.current.unread[inbox.id], false)
  assert.equal(
    result.current.decisions[`${inbox.id}:${approvalIndex}`],
    "executed"
  )
})

test("a setup question arriving in another chat is unread and waiting for a response", () => {
  const { result } = renderHook(() => useDemoInbox())
  act(() => result.current.selectChat("inbox-manager"))
  act(() => result.current.reportSetupWaiting(true))
  assert.equal(result.current.unread["new-bot"], true)
  assert.equal(result.current.setupWaiting, true)
  act(() => result.current.selectChat("new-bot"))
  assert.equal(result.current.unread["new-bot"], false)
  assert.equal(result.current.setupWaiting, true)
  act(() => result.current.reportSetupWaiting(false))
  assert.equal(result.current.setupWaiting, false)
})

test("only inbox and expenses start with approvals waiting", () => {
  const waiting = demoAgents
    .filter((agent) => pendingDemoDecisions(agent.id, agent.entries, {}) > 0)
    .map((agent) => agent.id)
  assert.deepEqual(waiting, ["inbox-manager", "expense-manager"])
})

test("confirmation replies belong to the right chat and preserve completion order", () => {
  const { result } = renderHook(() => useDemoInbox())
  act(() =>
    result.current.recordReply(
      "inbox-manager:4",
      "Archived the threads.",
      "Inbox Manager"
    )
  )
  act(() =>
    result.current.recordReply(
      "inbox-manager:5",
      "Sent to Dana.",
      "Inbox Manager"
    )
  )
  assert.deepEqual(
    Object.values(result.current.replies).map((reply) => reply.text),
    ["Archived the threads.", "Sent to Dana."]
  )
  assert.equal(
    result.current.replies["inbox-manager:5"].chatId,
    "inbox-manager"
  )
  assert.equal(result.current.unread["inbox-manager"], true)
  act(() => result.current.recordReply("inbox-manager:4", "", "Inbox Manager"))
  assert.equal(result.current.replies["inbox-manager:4"], undefined)
})

const { DemoAvatar } =
  await import("../components/landing/bot/chat-demo-avatar")
const { DemoActivity } =
  await import("../components/landing/bot/chat-demo-activity")
const { DemoResponse, demoResponseAgent } =
  await import("../components/landing/bot/chat-demo-response")

test("header, activity, and response avatars share the same bot identity", async () => {
  const agent = demoAgents.find((agent) => agent.id === "inbox-manager")!
  const view = await act(async () =>
    render(
      <>
        <DemoAvatar agent={agent} size={18} />
        <DemoActivity name={agent.name} agent={agent} />
        <DemoResponse name={agent.name} agent={agent}>
          Sent to Dana.
        </DemoResponse>
      </>
    )
  )
  const identities = [...view.container.querySelectorAll("[data-bot-color]")]
  assert.equal(identities.length, 3)
  for (const element of identities) {
    assert.equal(element.getAttribute("data-bot-id"), agent.id)
    assert.equal(element.getAttribute("data-bot-color"), agent.color)
    assert.equal(element.getAttribute("data-bot-shape"), agent.shape)
  }
  const setup = demoAgents.find((agent) => agent.id === "new-bot")!
  assert.equal(demoResponseAgent("Researcher", setup).id, setup.id)
  const group = demoAgents.find((agent) => agent.group)!
  assert.equal(demoResponseAgent("Inbox Manager", group).id, agent.id)
})

const { DemoComposer } =
  await import("../components/landing/bot/chat-demo-composer")
const { useDemoInvocation, demoInvocationReply } =
  await import("../components/landing/bot/chat-demo-invocation")

test("@ picker filters teammates, supports Enter selection, and submits a real mention range", async () => {
  let sent:
    | {
        text: string
        mentions: { botId: string; start: number; end: number }[]
      }
    | undefined
  const view = await act(async () =>
    render(
      <DemoComposer
        bots={demoAgents.filter((bot) => !bot.group)}
        name="Chief"
        disabled={false}
        onSend={(text, mentions) => {
          sent = { text, mentions }
        }}
      />
    )
  )
  const input = view.getByRole("textbox", {
    name: "Message Chief",
  }) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: "@Inbox", selectionStart: 6 } })
  assert.ok(view.getByRole("listbox", { name: "Mention a teammate" }))
  assert.equal(view.getAllByRole("option").length, 1)
  fireEvent.keyDown(input, { key: "Enter" })
  assert.equal(input.value, "@Inbox Manager ")
  const text = input.value + "what needs review?"
  fireEvent.change(input, {
    target: { value: text, selectionStart: text.length },
  })
  fireEvent.keyDown(input, { key: "Enter" })
  assert.equal(sent?.text, text)
  assert.equal(sent?.mentions[0].botId, "inbox-manager")
  assert.equal(
    text.slice(sent!.mentions[0].start, sent!.mentions[0].end),
    "@Inbox Manager"
  )
  assert.equal(input.value, "")
})

test("invoked teammates respond in the current conversation with their own identity", async () => {
  const messages: {
    chatId: string
    text: string
    kind: string
    botId: string
  }[] = []
  const { result } = renderHook(() =>
    useDemoInvocation((chatId, text, kind, bot) =>
      messages.push({ chatId, text, kind, botId: bot.id })
    )
  )
  const text = "@Talent Scout who is on the shortlist?"
  let work: Promise<void>
  act(() => {
    work = result.current.send(
      "chief-of-staff",
      text,
      [{ botId: "talent-scout", start: 0, end: "@Talent Scout".length }],
      demoAgents,
      {}
    )
  })
  assert.equal(result.current.pending["chief-of-staff"]?.id, "talent-scout")
  assert.equal(messages[0].kind, "user")
  await act(async () => {
    await work!
  })
  assert.equal(messages[1].chatId, "chief-of-staff")
  assert.equal(messages[1].botId, "talent-scout")
  assert.match(messages[1].text, /Mara/)
  assert.equal(result.current.pending["chief-of-staff"], undefined)
})

test("a declined expense report is never described as filed", () => {
  const expense = demoAgents.find((bot) => bot.id === "expense-manager")!
  const index = expense.entries.findIndex((entry) => entry.kind === "approval")
  assert.match(
    demoInvocationReply(expense, { [`${expense.id}:${index}`]: "denied" }),
    /left the report unfiled/
  )
})
