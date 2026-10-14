import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import type { UIMessageChunk } from "ai"
import type { ChatUIMessage } from "../../lib/sandbox-tools"

type Record = {
  id: number
  chunk: UIMessageChunk | { type: "trigger:turn-complete" }
}

// In-memory durable session at the network seam; the actual SDK still parses SSE.
export class ChatServer {
  readonly records: Record[] = []
  readonly inputs: { kind: string }[] = []
  readonly connections: { chatId: string; cursor: string | null }[] = []
  readonly readers = new Set<ReadableStreamDefaultController<Uint8Array>>()
  messages: ChatUIMessage[] = []
  savedCursor?: string
  settled = true
  starts = 0

  loadTranscript = async () => ({
    messages: structuredClone(this.messages),
    cursors: { lastOutEventId: this.savedCursor },
  })

  startSession = async () => {
    this.starts++
    return { publicAccessToken: "test-token" }
  }

  private encode(record: Record) {
    return new TextEncoder().encode(
      `id: ${record.id}\ndata: ${JSON.stringify(record.chunk)}\n\n`
    )
  }

  write(chunk: Record["chunk"]) {
    const record = { id: this.records.length + 1, chunk }
    this.records.push(record)
    for (const reader of this.readers) reader.enqueue(this.encode(record))
  }

  begin(text = "Still researching") {
    this.settled = false
    this.write({ type: "start", messageId: "answer" })
    this.write({ type: "text-start", id: "text" })
    this.write({ type: "text-delta", id: "text", delta: text })
  }

  finish(text = "Still researching. Finished.") {
    this.write({ type: "text-delta", id: "text", delta: ". Finished." })
    this.write({ type: "text-end", id: "text" })
    this.write({ type: "finish" })
    this.write({ type: "trigger:turn-complete" })
    this.messages.push({
      id: "answer",
      role: "assistant",
      parts: [{ type: "text", text, state: "done" }],
    })
    this.savedCursor = String(this.records.length)
    this.settled = true
  }

  fetch: NonNullable<
    ConstructorParameters<typeof TriggerChatTransport>[0]["fetch"]
  > = async (url, init) => {
    const chatId = decodeURIComponent(
      String(url).split("/sessions/")[1].split("/")[0]
    )
    if (String(url).endsWith("/append")) {
      const input = JSON.parse(String(init?.body))
      this.inputs.push(input)
      if (input.kind === "message") {
        this.settled = false
        this.messages.push(input.payload.message)
      }
      return Response.json({ seq: this.inputs.length })
    }
    const cursor = new Headers(init?.headers).get("Last-Event-ID")
    this.connections.push({ chatId, cursor })
    const settled = this.settled
    let reader: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        reader = controller
        for (const record of this.records)
          if (record.id > Number(cursor ?? 0))
            controller.enqueue(this.encode(record))
        if (settled) controller.close()
        else {
          this.readers.add(controller)
          init?.signal?.addEventListener(
            "abort",
            () => {
              if (this.readers.delete(controller)) controller.close()
            },
            { once: true }
          )
        }
      },
      cancel: () => {
        this.readers.delete(reader)
      },
    })
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        ...(settled && { "X-Session-Settled": "true" }),
      },
    })
  }
}
