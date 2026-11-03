import "./helpers/avatar-motion"
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { useRef } from "react"
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
} from "@testing-library/react"
import { ChatComposer } from "../components/chat-composer"
import {
  type PromptInputMessage,
  PromptInputProvider,
  usePromptInputController,
} from "../components/ai-elements/prompt-input"
import type { BotMention } from "../lib/composer"

import { toast } from "../components/ui/toast"

afterEach(() => {
  cleanup()
  mock.restoreAll()
})
const bots = [
  { id: "analyst", name: "Alex", avatar: "a", job: "Analyze pricing" },
  { id: "writer", name: "Alex", avatar: "b", job: "Write launch copy" },
  { id: "data", name: "Data Analyst", avatar: "c", job: "Data analysis" },
]

function TestInput({
  submit,
}: {
  submit: (
    text: string,
    mentions: BotMention[],
    files: PromptInputMessage["files"]
  ) => boolean | Promise<boolean>
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { textInput, attachments } = usePromptInputController()
  return (
    <>
      <button onClick={() => textInput.setInput("A different draft")}>
        Replace draft
      </button>
      <output data-testid="file-count">{attachments.files.length}</output>
      <button
        onClick={() =>
          attachments.add([
            new File(["draft"], "draft.txt", { type: "text/plain" }),
          ])
        }
      >
        Inject file
      </button>
      <ChatComposer
        bots={bots}
        memberIds={["analyst"]}
        inputRef={inputRef}
        placeholder="Message"
        onSubmit={(message, mentions) =>
          submit(message.text, mentions, message.files)
        }
      >
        <button type="submit">Send</button>
      </ChatComposer>
    </>
  )
}

function Harness({
  submit,
  initial = "",
}: {
  submit: (
    text: string,
    mentions: BotMention[],
    files: PromptInputMessage["files"]
  ) => boolean | Promise<boolean>
  initial?: string
}) {
  return (
    <PromptInputProvider initialInput={initial}>
      <TestInput submit={submit} />
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
  const avatar = view
    .getByRole("option")
    .querySelector("[data-slot=chat-avatar]")!
  assert.equal(avatar.getAttribute("data-reaction"), "curious")
  const uri = avatar.querySelector("img")!.getAttribute("src")!
  const svg = uri.includes(";base64,")
    ? Buffer.from(uri.split(",")[1], "base64").toString()
    : decodeURIComponent(uri.slice(uri.indexOf(",") + 1))
  assert.match(svg, /animation-slow-/)
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

for (const method of ["paste", "drop"] as const) {
  for (const mediaType of ["image/png", "text/plain"]) {
    for (const initial of ["", "Keep my draft"]) {
      test(`${method} rejects ${mediaType} with draft ${JSON.stringify(initial)}`, () => {
        const notices = mock.method(toast, "add", () => "notice")
        mock.method(URL, "createObjectURL", () => "data:text/plain;base64,ZA==")
        const view = render(
          <Harness
            initial={initial}
            submit={() => {
              throw new Error("Unexpected send")
            }}
          />
        )
        const input = view.getByRole("textbox") as HTMLTextAreaElement
        const file = new File(["synthetic"], "draft", { type: mediaType })
        for (let attempt = 0; attempt < 2; attempt++) {
          if (method === "paste") {
            fireEvent.paste(input, {
              clipboardData: {
                items: [{ kind: "file", getAsFile: () => file }],
              },
            })
          } else {
            fireEvent.drop(input, {
              dataTransfer: { types: ["Files"], files: [file] },
            })
          }
          assert.equal(notices.mock.callCount(), attempt + 1)
          assert.equal(
            notices.mock.calls[attempt].arguments[0]?.title,
            "Files aren't supported in web chat yet"
          )
          assert.equal(view.getByTestId("file-count").textContent, "0")
          assert.equal(input.value, initial)
        }
      })
    }
  }
}

test("a provider-injected file is rejected and removed while text and mentions survive for retry", async () => {
  const notices = mock.method(toast, "add", () => "notice")
  mock.method(URL, "createObjectURL", () => "data:text/plain;base64,ZA==")
  const received: {
    text: string
    mentions: BotMention[]
    files: PromptInputMessage["files"]
  }[] = []
  const view = render(
    <Harness
      submit={(text, mentions, files) => {
        received.push({ text, mentions, files })
        return true
      }}
    />
  )
  const input = type(view, "Ask @Data")
  fireEvent.keyDown(input, { key: "Enter" })
  type(view, "Ask @Data Analyst to help")
  fireEvent.click(view.getByRole("button", { name: "Inject file" }))
  assert.equal(view.getByTestId("file-count").textContent, "1")
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  })
  assert.equal(notices.mock.callCount(), 1)
  assert.equal(received.length, 0)
  assert.equal(input.value, "Ask @Data Analyst to help")
  assert.equal(view.getByTestId("file-count").textContent, "0")
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  })
  assert.deepEqual(received, [
    {
      text: "Ask @Data Analyst to help",
      mentions: [{ botId: "data", start: 4, end: 17 }],
      files: [],
    },
  ])
})

test("ordinary text paste remains a native edit and text sends without files", async () => {
  const notices = mock.method(toast, "add", () => "notice")
  let sent: string | undefined
  const view = render(
    <Harness
      submit={(text, _mentions, files) => {
        sent = text
        assert.deepEqual(files, [])
        return true
      }}
    />
  )
  const input = view.getByRole("textbox")
  const event = createEvent.paste(input, {
    clipboardData: { items: [{ kind: "string" }] },
  })
  fireEvent(input, event)
  assert.equal(event.defaultPrevented, false)
  // JSDOM doesn't implement the browser's default paste insertion.
  type(view, "Pasted text")
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  })
  assert.equal(sent, "Pasted text")
  assert.equal(notices.mock.callCount(), 0)
})
