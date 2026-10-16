import "./helpers/dom"
import assert from "node:assert/strict"
import { after, afterEach, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { APP_CONNECTION_OPTIONS } from "../lib/bot-setup-tools"

// next/link reads `self` when it loads, which the DOM helper doesn't define.
Object.defineProperty(globalThis, "self", {
  configurable: true,
  value: globalThis,
})
// Node's native channel dispatches native Events, while this suite runs in
// JSDOM. Use an asynchronous in-memory browser channel for popup messages.
const originalChannel = Object.getOwnPropertyDescriptor(
  globalThis,
  "BroadcastChannel"
)
class TestBroadcastChannel {
  static channels = new Set<TestBroadcastChannel>()
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(readonly name: string) {
    TestBroadcastChannel.channels.add(this)
  }
  postMessage(data: unknown) {
    for (const channel of TestBroadcastChannel.channels) {
      if (channel !== this && channel.name === this.name)
        queueMicrotask(() =>
          channel.onmessage?.({ data: structuredClone(data) })
        )
    }
  }
  close() {
    TestBroadcastChannel.channels.delete(this)
  }
}
Object.defineProperty(globalThis, "BroadcastChannel", {
  configurable: true,
  value: TestBroadcastChannel,
})
after(() => {
  if (originalChannel)
    Object.defineProperty(globalThis, "BroadcastChannel", originalChannel)
})
const { AppConnectionCardView } =
  await import("../components/chat-app-connection")
const { appConnectionOutcome, postAppConnection, resumeAfterWake } =
  await import("../hooks/app-connection-channel")

afterEach(cleanup)
const router = {
  push() {},
  replace() {},
  refresh() {},
  prefetch() {},
  back() {},
  forward() {},
} as unknown as AppRouterInstance

const base = { toolkit: "gmail", name: "Gmail", logo: null } as const

function setup(
  state: "connect" | "planLimit",
  extra: Partial<Parameters<typeof AppConnectionCardView>[0]> = {}
) {
  const answers: string[] = []
  const view = render(
    <AppRouterContext.Provider value={router}>
      <AppConnectionCardView
        connection={{ ...base, state }}
        question={
          state === "planLimit"
            ? "Your plan allows one app."
            : "Connect Gmail so I can read mail."
        }
        busy={false}
        chatId="chat_1"
        questionId="q_1"
        botId="bot_1"
        onAnswer={(answer) => void answers.push(answer)}
        {...extra}
      />
    </AppRouterContext.Provider>
  )
  return { ...view, answers }
}

test("connect state shows Connect", () => {
  const { getByRole } = setup("connect")
  assert.ok(getByRole("button", { name: "Connect" }))
})

test("plan limit state explains the limit and hides Connect", () => {
  const { queryByRole, getByText } = setup("planLimit")
  assert.equal(queryByRole("button", { name: "Connect" }), null)
  assert.ok(getByText("Your plan allows one app."))
})

test("secondary buttons answer with the exact option strings", async () => {
  for (const state of ["connect", "planLimit"] as const) {
    const { getByRole, answers, unmount } = setup(state)
    fireEvent.click(getByRole("button", { name: APP_CONNECTION_OPTIONS[1] }))
    await waitFor(() => assert.equal(answers.length, 1))
    unmount()
    const second = setup(state)
    fireEvent.click(
      second.getByRole("button", { name: APP_CONNECTION_OPTIONS[2] })
    )
    await waitFor(() => assert.equal(second.answers.length, 1))
    assert.deepEqual(
      [answers[0], second.answers[0]],
      [APP_CONNECTION_OPTIONS[1], APP_CONNECTION_OPTIONS[2]]
    )
    second.unmount()
  }
})

test("Connect passes the chat context and then offers I've connected it", async () => {
  const calls: unknown[][] = []
  const { getByRole, answers } = setup("connect", {
    connect: async (...args) => {
      calls.push(args)
      return { ok: true, url: "https://example.com/auth", accountId: "acc" }
    },
  })
  fireEvent.click(getByRole("button", { name: "Connect" }))
  const done = await waitFor(() =>
    getByRole("button", { name: APP_CONNECTION_OPTIONS[0] })
  )
  assert.deepEqual(calls, [
    ["gmail", { chatId: "chat_1", questionId: "q_1", botId: "bot_1" }],
  ])
  fireEvent.click(done)
  await waitFor(() => assert.deepEqual(answers, [APP_CONNECTION_OPTIONS[0]]))
})

test("outcomes follow the popup's report", () => {
  const q = "q_1"
  assert.equal(
    appConnectionOutcome({ questionId: "x", connected: true, woke: true }, q),
    "ignore"
  )
  assert.equal(
    appConnectionOutcome({ questionId: q, connected: true, woke: true }, q),
    "settle"
  )
  assert.equal(
    appConnectionOutcome({ questionId: q, connected: true, woke: false }, q),
    "answer"
  )
  assert.equal(
    appConnectionOutcome({ questionId: q, connected: true }, q),
    "answer"
  )
  assert.equal(
    appConnectionOutcome({ questionId: q, connected: false }, q),
    "retry"
  )
  assert.equal(appConnectionOutcome("nope", q), "ignore")
})

test("a woken bot settles the card and resumes the turn", async () => {
  let resumed = 0
  const { getByRole, queryByRole, getByText, answers } = setup("connect", {
    onResume: () => void resumed++,
    botName: "Alex",
  })
  postAppConnection({ questionId: "q_1", connected: true, woke: true })
  await waitFor(() => getByText("Connected. Alex is continuing."))
  assert.equal(resumed, 1)
  assert.equal(queryByRole("button", { name: "Connect" }), null)
  assert.ok(getByRole("status"))
  assert.deepEqual(answers, [])
})

const startConnect = async (view: ReturnType<typeof setup>) => {
  fireEvent.click(view.getByRole("button", { name: "Connect" }))
  await waitFor(() =>
    view.getByRole("button", { name: APP_CONNECTION_OPTIONS[0] })
  )
}
const connectOk = async () => ({
  ok: true as const,
  url: "https://example.com/auth",
  accountId: "acc",
})

test("the tab that started the connection answers when the bot wasn't woken", async () => {
  const view = setup("connect", { connect: connectOk })
  await startConnect(view)
  postAppConnection({ questionId: "q_1", connected: true, woke: false })
  await waitFor(() =>
    assert.deepEqual(view.answers, [APP_CONNECTION_OPTIONS[0]])
  )
})

test("another tab does not answer, it offers the button", async () => {
  const view = setup("connect")
  postAppConnection({ questionId: "q_1", connected: true, woke: false })
  await waitFor(() => view.getByText("Connected. Confirm to continue."))
  assert.deepEqual(view.answers, [])
  assert.ok(view.getByRole("button", { name: APP_CONNECTION_OPTIONS[0] }))
})

test("a queued answer waits while busy, then sends once", async () => {
  const answers: string[] = []
  const element = (busy: boolean) => (
    <AppRouterContext.Provider value={router}>
      <AppConnectionCardView
        connection={{ ...base, state: "connect" }}
        question="Connect Gmail."
        busy={busy}
        chatId="chat_1"
        questionId="q_1"
        botId="bot_1"
        connect={connectOk}
        onAnswer={(answer) => void answers.push(answer)}
      />
    </AppRouterContext.Provider>
  )
  const r = render(element(false))
  fireEvent.click(r.getByRole("button", { name: "Connect" }))
  await waitFor(() =>
    r.getByRole("button", { name: APP_CONNECTION_OPTIONS[0] })
  )
  r.rerender(element(true))
  postAppConnection({ questionId: "q_1", connected: true, woke: false })
  await waitFor(() => r.getByText("Connected. Sending your answer…"))
  assert.deepEqual(answers, [])
  r.rerender(element(false))
  await waitFor(() => assert.deepEqual(answers, [APP_CONNECTION_OPTIONS[0]]))
})

test("a failure shows an error and keeps Connect", async () => {
  const view = setup("connect")
  postAppConnection({ questionId: "q_1", connected: false })
  await waitFor(() => view.getByText(/wasn't completed/))
  assert.ok(view.getByRole("button", { name: "Connect" }))
})

test("a woken turn is resumed from its input sequence, else the transcript reloads", () => {
  const calls: unknown[] = []
  const transport = {
    getSession: () => ({ isStreaming: false, token: "t" }) as never,
    setSession: (...args: unknown[]) => void calls.push(["set", ...args]),
  }
  resumeAfterWake({
    inputSeq: 4,
    chatId: "c",
    transport,
    resume: () => void calls.push("resume"),
    reload: () => void calls.push("reload"),
  })
  assert.deepEqual(calls, [
    ["set", "c", { isStreaming: true, token: "t", activeInputSeq: 4 }],
    "resume",
  ])
  const later: unknown[] = []
  resumeAfterWake({
    chatId: "c",
    transport,
    resume: () => void later.push("resume"),
    reload: () => void later.push("reload"),
    schedule: (callback, delay) => {
      later.push(["delay", delay])
      callback()
    },
  })
  assert.deepEqual(later, [["delay", 1500], "reload"])
})
