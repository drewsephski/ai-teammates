import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { AppConnectionCardView } from "../components/chat-app-connection"
import { APP_CONNECTION_OPTIONS } from "../lib/bot-setup-tools"

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
  assert.ok(getByText(/free plan includes one connected app/i))
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
