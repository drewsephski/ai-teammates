import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { StrictMode, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"
import { useChatSession } from "../hooks/use-chat-session"
import { useResumeChatStream } from "../hooks/use-resume-chat-stream"
import { navigationChatTransport } from "../lib/chat-transport"
import { chatActivity } from "../lib/chat-activity"
import { seenMessageIds } from "../lib/chat-receipts"
import type { ChatUIMessage } from "../lib/sandbox-tools"
import { ChatServer } from "./helpers/chat-server"

afterEach(cleanup)

const question: ChatUIMessage = {
  id: "question",
  role: "user",
  parts: [{ type: "text", text: "Research this" }],
}

function Conversation({
  transport,
  server,
  chatId = "research",
  setup = false,
  attempt = 0,
}: {
  transport: TriggerChatTransport
  server: ChatServer
  chatId?: string
  setup?: boolean
  attempt?: number
}) {
  const loaded = useChatSession({
    chatId,
    transport,
    loadTranscript: server.loadTranscript,
    attempt,
  })
  if (loaded.error) return <p>{loaded.error.message}</p>
  if (loaded.isLoading) return <p>Loading conversation</p>
  return (
    <Messages
      key={chatId}
      chatId={chatId}
      initialMessages={loaded.messages}
      setup={setup}
      transport={transport}
    />
  )
}

function Messages({
  chatId,
  initialMessages,
  setup,
  transport,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
  setup: boolean
  transport: TriggerChatTransport
}) {
  const viewerTransport = useMemo(
    () => navigationChatTransport(transport),
    [transport]
  )
  const { messages, status, resumeStream, sendMessage, stop } =
    useChat<ChatUIMessage>({
      id: chatId,
      messages: initialMessages,
      transport: viewerTransport,
    })
  useResumeChatStream({
    chatId,
    initialMessages,
    resumeStream,
    setup,
    transport,
  })
  const activity = chatActivity(messages, status, {
    botIds: ["scout"],
    fallbackBotId: "scout",
    seen: seenMessageIds(messages),
  })
  return (
    <>
      <output aria-label="Progress">{activity.state}</output>
      <output aria-label="Reply">
        {messages
          .flatMap((message) => message.parts)
          .map((part) => (part.type === "text" ? part.text : ""))}
      </output>
      <button onClick={() => void sendMessage({ text: "Research this" })}>
        Send
      </button>
      <button
        onClick={() => {
          void stop()
          void transport.stopGeneration(chatId)
        }}
      >
        Stop
      </button>
    </>
  )
}

function transportFor(server: ChatServer) {
  return new TriggerChatTransport({
    task: "chat",
    accessToken: () => "test-token",
    startSession: server.startSession,
    fetch: server.fetch,
  })
}

for (const setup of [false, true]) {
  test(`returning to a ${setup ? "setup" : "regular"} conversation restores reply and live progress in Strict Mode`, async () => {
    const server = new ChatServer()
    server.messages = [question]
    server.begin()
    const transport = transportFor(server)
    try {
      const view = render(
        <StrictMode>
          <Conversation server={server} transport={transport} setup={setup} />
        </StrictMode>
      )
      await waitFor(() =>
        assert.match(
          view.getByLabelText("Reply").textContent ?? "",
          /Still researching/
        )
      )
      assert.equal(view.getByLabelText("Progress").textContent, "responding")
      assert.equal(server.connections.length, 1)
      await act(async () => server.finish())
      await waitFor(() =>
        assert.equal(view.getByLabelText("Progress").textContent, "idle")
      )
      assert.match(view.getByLabelText("Reply").textContent ?? "", /Finished/)
      assert.equal(server.inputs.length, 0)
    } finally {
      transport.dispose()
    }
  })
}

test("navigation after Send disconnects the viewer without sending Stop, then replays the unfinished reply", async () => {
  const server = new ChatServer()
  const first = transportFor(server)
  const second = transportFor(server)
  try {
    const view = render(<Conversation server={server} transport={first} />)
    await waitFor(() => view.getByRole("button", { name: "Send" }))
    await waitFor(() => assert.equal(server.connections.length, 1))
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Send" }))
    )
    await waitFor(() => assert.equal(server.inputs.length, 1))
    await act(async () => server.begin())
    await waitFor(() =>
      assert.match(
        view.getByLabelText("Reply").textContent ?? "",
        /Still researching/
      )
    )
    await act(async () => view.unmount())
    await waitFor(() => assert.equal(server.readers.size, 0))
    assert.deepEqual(
      server.inputs.map((input) => input.kind),
      ["message"]
    )
    const returned = render(
      <StrictMode>
        <Conversation server={server} transport={second} />
      </StrictMode>
    )
    await waitFor(() =>
      assert.equal(
        returned.getByLabelText("Progress").textContent,
        "responding"
      )
    )
    await act(async () => server.finish())
    await waitFor(() =>
      assert.match(
        returned.getByLabelText("Reply").textContent ?? "",
        /Finished/
      )
    )
    await waitFor(() =>
      assert.equal(returned.getByLabelText("Progress").textContent, "idle")
    )
    assert.equal(server.inputs.length, 1)
  } finally {
    first.dispose()
    second.dispose()
  }
})

test("a reused transport rewinds to the transcript cursor instead of skipping the partial answer", async () => {
  const server = new ChatServer()
  server.messages = [question]
  server.savedCursor = "1"
  server.write({ type: "trigger:turn-complete" })
  server.begin()
  const transport = transportFor(server)
  transport.setSession("research", {
    publicAccessToken: "test-token",
    lastEventId: "4",
    isStreaming: false,
  })
  try {
    const view = render(<Conversation server={server} transport={transport} />)
    await waitFor(() =>
      assert.equal(view.getByLabelText("Progress").textContent, "responding")
    )
    assert.equal(server.connections[0].cursor, "1")
    assert.match(
      view.getByLabelText("Reply").textContent ?? "",
      /Still researching/
    )
  } finally {
    transport.dispose()
  }
})

test("a response finished while away loads once and stays idle", async () => {
  const server = new ChatServer()
  server.messages = [question]
  server.begin()
  server.finish()
  const transport = transportFor(server)
  try {
    const view = render(<Conversation server={server} transport={transport} />)
    await waitFor(() =>
      assert.match(view.getByLabelText("Reply").textContent ?? "", /Finished/)
    )
    await waitFor(() => assert.equal(server.connections.length, 1))
    assert.equal(view.getByLabelText("Progress").textContent, "idle")
    assert.equal(
      view.getByLabelText("Reply").textContent?.split("Still researching")
        .length,
      2
    )
    assert.equal(server.readers.size, 0)
    assert.equal(server.inputs.length, 0)
  } finally {
    transport.dispose()
  }
})

test("explicit Stop still sends the backend stop command", async () => {
  const server = new ChatServer()
  server.messages = [question]
  server.begin()
  const transport = transportFor(server)
  try {
    const view = render(<Conversation server={server} transport={transport} />)
    await waitFor(() =>
      assert.equal(view.getByLabelText("Progress").textContent, "responding")
    )
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Stop" }))
    )
    await waitFor(() =>
      assert.deepEqual(
        server.inputs.map((input) => input.kind),
        ["stop"]
      )
    )
    assert.equal(view.getByLabelText("Progress").textContent, "idle")
  } finally {
    transport.dispose()
  }
})

test("rapid A to B to A navigation reattaches without duplicating subscriptions", async () => {
  const server = new ChatServer()
  server.messages = [question]
  server.begin()
  const transport = transportFor(server)
  try {
    const view = render(<Conversation server={server} transport={transport} />)
    await waitFor(() =>
      assert.equal(view.getByLabelText("Progress").textContent, "responding")
    )
    await act(async () =>
      view.rerender(
        <Conversation chatId="other" server={server} transport={transport} />
      )
    )
    await act(async () =>
      view.rerender(<Conversation server={server} transport={transport} />)
    )
    await waitFor(() =>
      assert.equal(view.getByLabelText("Progress").textContent, "responding")
    )
    assert.equal(server.connections.at(-1)?.chatId, "research")
    await waitFor(() => assert.equal(server.readers.size, 1))
    assert.equal(server.inputs.length, 0)
    await act(async () => server.finish())
    await waitFor(() =>
      assert.equal(view.getByLabelText("Progress").textContent, "idle")
    )
  } finally {
    transport.dispose()
  }
})

test("a transcript from a page left during loading cannot overwrite the current chat", async () => {
  const server = new ChatServer()
  let resolveOld!: (value: { messages: ChatUIMessage[] }) => void
  const oldTranscript = new Promise<{ messages: ChatUIMessage[] }>(
    (resolve) => {
      resolveOld = resolve
    }
  )
  let loads = 0
  server.loadTranscript = async () => {
    loads++
    if (loads === 1)
      return {
        ...(await oldTranscript),
        cursors: { lastOutEventId: undefined },
      }
    return { messages: [question], cursors: { lastOutEventId: undefined } }
  }
  const transport = transportFor(server)
  try {
    const view = render(
      <Conversation chatId="old" server={server} transport={transport} />
    )
    await waitFor(() => assert.equal(loads, 1))
    await act(async () =>
      view.rerender(<Conversation server={server} transport={transport} />)
    )
    await waitFor(() =>
      assert.equal(view.getByLabelText("Reply").textContent, "Research this")
    )
    await act(async () => resolveOld({ messages: [] }))
    assert.equal(view.getByLabelText("Reply").textContent, "Research this")
    assert.equal(server.connections.at(-1)?.chatId, "research")
  } finally {
    transport.dispose()
  }
})
