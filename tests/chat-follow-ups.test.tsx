import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useRef } from "react"
import { useChat } from "@ai-sdk/react"
import type { ChatTransport, UIMessageChunk } from "ai"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { ChatFollowUps } from "../components/chat-follow-ups"
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
} from "../components/ai-elements/prompt-input"
import { latestFollowUps } from "../lib/chat-follow-ups"
import type { ChatUIMessage } from "../lib/sandbox-tools"

afterEach(cleanup)

test("suggestions fill and focus the composer without sending; edits survive rejected submission", async () => {
  let submits = 0
  let selections = 0
  function Composer() {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    return (
      <PromptInputProvider>
        <ChatFollowUps
          suggestions={[
            {
              label: "Try five founders",
              prompt: "Test Krafty's launch with five founders.",
            },
          ]}
          inputRef={inputRef}
          onSelect={() => selections++}
        />
        <PromptInput
          onSubmit={() => {
            submits++
            return false
          }}
        >
          <PromptInputTextarea ref={inputRef} aria-label="Message" />
          <button type="submit">Send</button>
        </PromptInput>
      </PromptInputProvider>
    )
  }
  const view = render(<Composer />)
  const input = view.getByRole("textbox") as HTMLTextAreaElement
  fireEvent.click(view.getByRole("button", { name: "Try five founders" }))
  assert.equal(input.value, "Test Krafty's launch with five founders.")
  assert.equal(document.activeElement, input)
  assert.equal(submits, 0)
  assert.equal(selections, 1)
  assert.equal(
    view.queryByRole("group", { name: "Suggested follow-up prompts" }),
    null
  )
  fireEvent.input(input, { target: { value: "My edited prompt" } })
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  assert.equal(submits, 1)
  assert.equal(input.value, "My edited prompt")
  fireEvent.input(input, { target: { value: "" } })
  assert.ok(view.getByRole("button", { name: "Try five founders" }))
})

test("existing drafts and empty suggestions render no follow-up controls", () => {
  for (const initialInput of ["My draft", ""]) {
    const view = render(
      <PromptInputProvider initialInput={initialInput}>
        <ChatFollowUps
          suggestions={
            initialInput
              ? [{ label: "Another idea", prompt: "Do something else" }]
              : []
          }
          inputRef={{ current: null }}
        />
      </PromptInputProvider>
    )
    assert.equal(view.queryByRole("group"), null)
    view.unmount()
  }
})

test("follow-ups streamed after the model finishes render and survive transcript reload", async () => {
  const suggestions = [
    {
      label: "Draft the invite",
      prompt: "Draft the Krafty founder dinner invite.",
    },
    {
      label: "Compare demo formats",
      prompt: "Compare a dinner with one-on-one demos.",
    },
    {
      label: "Try a live task relay",
      prompt: "Design a live task relay for the dinner.",
    },
  ]
  let transcript: ChatUIMessage[] = []
  const transport: ChatTransport<ChatUIMessage> = {
    sendMessages: async () =>
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of [
            { type: "start", messageId: "reply" },
            { type: "text-start", id: "text" },
            {
              type: "text-delta",
              id: "text",
              delta: "Invite five founders to dinner.",
            },
            { type: "text-end", id: "text" },
            { type: "finish", finishReason: "stop" },
            // Trigger's completion hook writes these after the model's finish.
            {
              type: "data-followUps",
              id: "follow-ups:reply",
              data: { botId: "bot", suggestions },
            },
          ] satisfies UIMessageChunk[])
            controller.enqueue(chunk)
          controller.close()
        },
      }),
    reconnectToStream: async () => null,
  }
  function Composer({
    initialMessages = [],
  }: {
    initialMessages?: ChatUIMessage[]
  }) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const { messages, status, sendMessage } = useChat<ChatUIMessage>({
      transport,
      messages: initialMessages,
    })
    transcript = messages
    const followUps = status === "ready" ? latestFollowUps(messages) : undefined
    return (
      <PromptInputProvider>
        <ChatFollowUps
          suggestions={followUps?.suggestions ?? []}
          inputRef={inputRef}
        />
        <PromptInput
          onSubmit={async ({ text }) => {
            await sendMessage({ text })
          }}
        >
          <PromptInputTextarea ref={inputRef} aria-label="Message" />
          <button type="submit">Send</button>
        </PromptInput>
      </PromptInputProvider>
    )
  }
  const view = render(<Composer />)
  fireEvent.input(view.getByRole("textbox"), {
    target: { value: "Plan my Krafty launch." },
  })
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  })
  assert.ok(view.getByRole("button", { name: "Draft the invite" }))
  assert.equal(
    view
      .getByRole("group", { name: "Suggested follow-up prompts" })
      .querySelectorAll("button").length,
    3
  )
  const storedTranscript = JSON.parse(
    JSON.stringify(transcript)
  ) as ChatUIMessage[]
  view.unmount()
  const reloaded = render(<Composer initialMessages={storedTranscript} />)
  fireEvent.click(reloaded.getByRole("button", { name: "Draft the invite" }))
  assert.equal(
    (reloaded.getByRole("textbox") as HTMLTextAreaElement).value,
    suggestions[0].prompt
  )
})
