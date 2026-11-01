import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"

import { ChatSecretRequest } from "../components/chat-secret-request"
import { toast } from "../components/ui/toast"
import type { SecretSaveInput } from "../db/schema"
import type { ChatUIMessage } from "../lib/sandbox-tools"

type SecretPart = Extract<
  ChatUIMessage["parts"][number],
  { type: "tool-requestSecret" }
>

afterEach(() => {
  cleanup()
  mock.restoreAll()
})

const KEY = "sk-test-not-a-real-key-123456"

function requested(url?: string): SecretPart {
  return {
    type: "tool-requestSecret",
    toolCallId: "call_secret_1",
    state: "output-available",
    input: {
      name: "OPENAI_API_KEY",
      label: "OpenAI API key",
      description: "Create one under API keys in your OpenAI dashboard.",
      ...(url && { url }),
    },
    output: {
      state: "requested",
      name: "OPENAI_API_KEY",
      label: "OpenAI API key",
      description: "Create one under API keys in your OpenAI dashboard.",
      ...(url && { url }),
    },
  } as SecretPart
}

function renderCard(
  part: SecretPart,
  overrides: Partial<Parameters<typeof ChatSecretRequest>[0]> = {}
) {
  return render(
    <ChatSecretRequest
      part={part}
      active
      busy={false}
      chatId="chat_1"
      botId="bot_1"
      onAnswer={() => true}
      onDismiss={() => true}
      {...overrides}
    />
  )
}

test("shows the label, a masked input and a safe link to the key page", () => {
  const view = renderCard(requested("https://platform.openai.com/api-keys"))
  assert.ok(view.getByRole("form", { name: "Add OpenAI API key" }))
  assert.ok(view.getByText(/under API keys in your OpenAI dashboard/))
  const input = view.getByLabelText("OpenAI API key") as HTMLInputElement
  assert.equal(input.type, "password")
  assert.equal(input.getAttribute("autocomplete"), "off")
  assert.equal(input.getAttribute("spellcheck"), "false")
  assert.ok(view.getByText(/as \$OPENAI_API_KEY/))

  const link = view.getByRole("link", { name: /Open platform\.openai\.com/ })
  assert.equal(
    link.getAttribute("href"),
    "https://platform.openai.com/api-keys"
  )
  assert.equal(link.getAttribute("target"), "_blank")
  assert.equal(link.getAttribute("rel"), "noopener noreferrer")

  fireEvent.click(view.getByRole("button", { name: "Show key" }))
  assert.equal(input.type, "text")
  fireEvent.click(view.getByRole("button", { name: "Hide key" }))
  assert.equal(input.type, "password")
})

test("Save sends the key to the action with the tool call as questionId, then resumes", async () => {
  const toasts = mock.method(toast, "add", () => "toast")
  const calls: SecretSaveInput[] = []
  const resumed: (number | undefined)[] = []
  let answers = 0
  const view = renderCard(requested(), {
    save: async (input) => {
      calls.push(input)
      return { woke: true, inputSeq: 7 }
    },
    onResume: (inputSeq) => resumed.push(inputSeq),
    onAnswer: () => {
      answers++
      return true
    },
  })
  const input = view.getByLabelText("OpenAI API key") as HTMLInputElement
  fireEvent.change(input, { target: { value: `  ${KEY}  ` } })
  fireEvent.click(view.getByRole("button", { name: "Save" }))

  await waitFor(() => assert.deepEqual(resumed, [7]))
  assert.deepEqual(calls, [
    {
      name: "OPENAI_API_KEY",
      label: "OpenAI API key",
      value: KEY,
      chatId: "chat_1",
      botId: "bot_1",
      questionId: "call_secret_1",
    },
  ])
  assert.equal(answers, 0)
  await waitFor(() => assert.equal(input.value, ""))
  const [notice] = toasts.mock.calls.map((call) => call.arguments[0])
  assert.equal(notice?.title, "OpenAI API key saved")
  // The value never reaches a toast
  assert.ok(!JSON.stringify(toasts.mock.calls).includes(KEY))
})

test("an empty key isn't sent", async () => {
  let saves = 0
  const view = renderCard(requested(), {
    save: async () => {
      saves++
      return { woke: true }
    },
  })
  fireEvent.click(view.getByRole("button", { name: "Save" }))
  await waitFor(() => assert.ok(view.getByText("Paste the key.")))
  assert.equal(saves, 0)
})

test("a failed save keeps the key in the form and says so", async () => {
  const toasts = mock.method(toast, "add", () => "toast")
  const view = renderCard(requested(), {
    save: async () => {
      throw new Error("boom")
    },
  })
  const input = view.getByLabelText("OpenAI API key") as HTMLInputElement
  fireEvent.change(input, { target: { value: KEY } })
  fireEvent.click(view.getByRole("button", { name: "Save" }))
  await waitFor(() => assert.equal(toasts.mock.callCount(), 1))
  assert.deepEqual(toasts.mock.calls[0]?.arguments[0], {
    type: "error",
    title: "Couldn't save the key",
    description: "Try again.",
  })
  assert.equal(input.value, KEY)
})

test("when the bot wasn't woken, the card tells it in a message without the key", async () => {
  mock.method(toast, "add", () => "toast")
  const answers: string[] = []
  const view = renderCard(requested(), {
    save: async () => ({ woke: false }),
    onAnswer: (answer) => {
      answers.push(answer)
      return true
    },
  })
  fireEvent.change(view.getByLabelText("OpenAI API key"), {
    target: { value: KEY },
  })
  fireEvent.click(view.getByRole("button", { name: "Save" }))
  await waitFor(() =>
    assert.deepEqual(answers, ["I saved OpenAI API key as $OPENAI_API_KEY."])
  )
})

test("Not now dismisses once", async () => {
  let dismissals = 0
  const view = renderCard(requested(), {
    onDismiss: async () => {
      dismissals++
      return true
    },
  })
  const button = view.getByRole("button", { name: "Not now" })
  fireEvent.click(button)
  fireEvent.click(button)
  await waitFor(() => assert.equal(dismissals, 1))
})

test("a saved output renders nothing", () => {
  const part = {
    type: "tool-requestSecret",
    toolCallId: "call_secret_2",
    state: "output-available",
    input: {
      name: "OPENAI_API_KEY",
      label: "OpenAI API key",
      description: "Create one in your OpenAI dashboard.",
    },
    output: { state: "saved", name: "OPENAI_API_KEY", label: "OpenAI API key" },
  } as SecretPart
  const view = renderCard(part)
  assert.equal(view.container.innerHTML, "")
})

test("the card is disabled while the bot is busy", () => {
  const view = renderCard(requested(), { busy: true })
  assert.equal(
    (view.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled,
    true
  )
  assert.equal(
    (view.getByLabelText("OpenAI API key") as HTMLInputElement).disabled,
    true
  )
})
