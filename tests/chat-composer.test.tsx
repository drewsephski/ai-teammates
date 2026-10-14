import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useRef } from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { ChatComposer } from "../components/chat-composer"
import {
  PromptInputProvider,
  usePromptInputController,
} from "../components/ai-elements/prompt-input"
import type { BotMention } from "../lib/composer"

globalThis.requestAnimationFrame = (callback) => {
  callback(0)
  return 0
}
afterEach(cleanup)
const bots = [
  { id: "analyst", name: "Alex", avatar: "a", job: "Analyze pricing" },
  { id: "writer", name: "Alex", avatar: "b", job: "Write launch copy" },
  { id: "data", name: "Data Analyst", avatar: "c", job: "Data analysis" },
]

function Harness({
  submit,
  initial = "",
}: {
  submit: (text: string, mentions: BotMention[]) => boolean | Promise<boolean>
  initial?: string
}) {
  function Input() {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const { textInput } = usePromptInputController()
    return (
      <>
        <button onClick={() => textInput.setInput("A different draft")}>
          Replace draft
        </button>
        <ChatComposer
          bots={bots}
          memberIds={["analyst"]}
          inputRef={inputRef}
          placeholder="Message"
          onSubmit={(message, mentions) => submit(message.text, mentions)}
        >
          <button type="submit">Send</button>
        </ChatComposer>
      </>
    )
  }
  return (
    <PromptInputProvider initialInput={initial}>
      <Input />
    </PromptInputProvider>
  )
}

function type(view: ReturnType<typeof render>, value: string) {
  const input = view.getByRole("textbox") as HTMLTextAreaElement
  fireEvent.change(input, { target: { value, selectionStart: value.length } })
  return input
}

test("slash selection supports arrow keys, Tab, and never sends on selection", async () => {
  let sends = 0
  const view = render(
    <Harness
      submit={() => {
        sends++
        return true
      }}
    />
  )
  const input = type(view, "/")
  assert.equal(view.getAllByRole("option").length, 7)
  fireEvent.keyDown(input, { key: "ArrowDown" })
  fireEvent.keyDown(input, { key: "Tab" })
  assert.equal(input.value, "/delegate @")
  assert.equal(sends, 0)
  assert.ok(view.getByRole("listbox", { name: "Mention a teammate" }))
  fireEvent.keyDown(input, { key: "Escape" })
  assert.equal(view.queryByRole("listbox"), null)
})

test("role search selects the right duplicate name across chats, and carries the ID on submit", async () => {
  let sent: { text: string; mentions: BotMention[] } | undefined
  const view = render(
    <Harness
      submit={(text, mentions) => {
        sent = { text, mentions }
        return true
      }}
    />
  )
  const input = type(view, "Ask @copy")
  assert.equal(view.getAllByRole("option").length, 1)
  assert.match(view.getByRole("option").textContent ?? "", /Other chat/)
  fireEvent.keyDown(input, { key: "Enter" })
  assert.equal(input.value, "Ask @Alex ")
  type(view, "Ask @Alex to review this launch")
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  assert.deepEqual(sent, {
    text: "Ask @Alex to review this launch",
    mentions: [{ botId: "writer", start: 4, end: 9 }],
  })
  assert.equal(input.value, "")
})

test("multiword tags survive surrounding edits, rejected submission, and retry", async () => {
  let attempts = 0
  const received: BotMention[][] = []
  const view = render(
    <Harness
      submit={(_text, mentions) => {
        received.push(mentions)
        return ++attempts > 1
      }}
    />
  )
  const input = type(view, "Ask @Data")
  fireEvent.keyDown(input, { key: "Enter" })
  type(view, "Please Ask @Data Analyst ")
  type(view, "Please Ask @Data Analyst about revenue")
  for (let i = 0; i < 2; i++)
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Send" }))
    )
  assert.deepEqual(received, [
    [{ botId: "data", start: 11, end: 24 }],
    [{ botId: "data", start: 11, end: 24 }],
  ])
  assert.equal(input.value, "")
})

test("editing a tag or replacing a draft does not reuse stale IDs", async () => {
  const received: BotMention[][] = []
  const view = render(
    <Harness
      submit={(_text, mentions) => {
        received.push(mentions)
        return false
      }}
    />
  )
  const input = type(view, "Ask @copy")
  fireEvent.keyDown(input, { key: "Enter" })
  type(view, "Ask @Alec about the draft")
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  assert.deepEqual(received[0], [])
  type(view, "@Data")
  fireEvent.keyDown(input, { key: "Enter" })
  fireEvent.click(view.getByRole("button", { name: "Replace draft" }))
  type(view, "@Data Analyst original name but plain text")
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  assert.deepEqual(received[1], [])
})

test("help and invalid commands are local, preserve useful drafts, and never call the agent", async () => {
  let sends = 0
  const view = render(
    <Harness
      submit={() => {
        sends++
        return true
      }}
    />
  )
  const input = type(view, "/help")
  // Clicking Send executes help rather than autocomplete.
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  assert.ok(view.getByText("Composer shortcuts"))
  for (const draft of [
    "/unknown launch",
    "/ask question",
    "/delegate task",
    "/delegate @Alex",
  ]) {
    type(view, draft)
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Send" }))
    )
    assert.equal(input.value, draft)
  }
  assert.equal(sends, 0)
})

test("IME composition never selects a suggestion or submits a message", () => {
  const view = render(
    <Harness
      submit={() => {
        throw new Error("Unexpected submit")
      }}
    />
  )
  const input = type(view, "/")
  fireEvent.keyDown(input, { key: "Enter", isComposing: true })
  assert.equal(input.value, "/")
})
