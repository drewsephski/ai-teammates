import { createOpenAI } from "@ai-sdk/openai"

import { CHATGPT_RESOURCE } from "@/lib/chatgpt-config"
import { normalizeFailedToolCalls } from "@/lib/model-tool-replay"
import {
  CHATGPT_REQUEST_ERROR,
  chatGPTErrorMessage,
} from "@/lib/chatgpt-policy"

// Enforce the SIWC preview contract at the transport boundary, regardless of
// future agent defaults. History is supplied on every request; nothing is stored.
export function chatGPTRequestBody(body: string) {
  const parsed: unknown = JSON.parse(body)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(CHATGPT_REQUEST_ERROR)
  const result = { ...parsed } as Record<string, unknown>
  for (const field of [
    "background",
    "conversation",
    "max_output_tokens",
    "max_tool_calls",
    "metadata",
    "moderation",
    "multi_agent",
    "prompt",
    "prompt_cache_retention",
    "safety_identifier",
    "temperature",
    "top_logprobs",
    "top_p",
    "truncation",
    "user",
    "previous_response_id",
  ])
    delete result[field]
  result.store = false
  result.stream = true
  if (!Array.isArray(result.input)) throw new Error(CHATGPT_REQUEST_ERROR)
  return JSON.stringify(result)
}

// SSE errors can arrive after HTTP 200. Keep the provider error shape while
// replacing its message so credentials/internal diagnostics never reach the UI.
export function sanitizedChatGPTStream(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ""
  let terminal = false
  const sanitize = (line: string) => {
    if (!line.startsWith("data:")) return line
    try {
      const event = JSON.parse(line.slice(5)) as Record<string, unknown>
      if (
        [
          "response.completed",
          "response.failed",
          "response.incomplete",
          "error",
        ].includes(String(event.type))
      )
        terminal = true
      if (event.type === "error") {
        const nested =
          event.error &&
          typeof event.error === "object" &&
          "code" in event.error
            ? event.error.code
            : undefined
        const code =
          typeof event.code === "string"
            ? event.code
            : typeof nested === "string"
              ? nested
              : undefined
        return `data: ${JSON.stringify({ type: "error", sequence_number: event.sequence_number ?? 0, code, message: chatGPTErrorMessage(0, code) })}`
      }
      if (
        (event.type === "response.failed" ||
          event.type === "response.incomplete") &&
        event.response &&
        typeof event.response === "object"
      ) {
        const response = event.response as Record<string, unknown>
        const error = response.error as { code?: string } | undefined
        return `data: ${JSON.stringify({ type: "response.failed", sequence_number: event.sequence_number ?? 0, response: { status: "failed", usage: response.usage, error: { code: error?.code ?? "chatgpt_request_failed", message: chatGPTErrorMessage(0, error?.code) } } })}`
      }
    } catch {
      // Let the SDK reject malformed events without logging the raw stream.
    }
    return line
  }
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true })
        const lines = pending.split("\n")
        pending = lines.pop() ?? ""
        for (const line of lines)
          controller.enqueue(encoder.encode(`${sanitize(line)}\n`))
      },
      flush(controller) {
        pending += decoder.decode()
        if (pending) controller.enqueue(encoder.encode(sanitize(pending)))
        if (!terminal)
          controller.enqueue(
            encoder.encode(
              `\n\nevent: error\ndata: ${JSON.stringify({ type: "error", code: "chatgpt_stream_interrupted", message: CHATGPT_REQUEST_ERROR, sequence_number: 0 })}\n\n`
            )
          )
      },
    })
  )
}

export function createChatGPTModel(
  modelId: string,
  accessToken: () => Promise<string>,
  fetcher: typeof fetch = fetch
) {
  const model = createOpenAI({
    // Each request obtains the selected user's current token, including tool steps.
    apiKey: "chatgpt-session-managed-on-server",
    baseURL: CHATGPT_RESOURCE,
    name: "chatgpt-plan",
    fetch: async (url, init) => {
      const token = await accessToken()
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${token}`)
      let response: Response
      try {
        response = await fetcher(url, {
          ...init,
          headers,
          body:
            typeof init?.body === "string"
              ? chatGPTRequestBody(init.body)
              : init?.body,
          redirect: "error",
        })
      } catch {
        throw new Error(CHATGPT_REQUEST_ERROR)
      }
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const code =
          body &&
          typeof body === "object" &&
          "error" in body &&
          body.error &&
          typeof body.error === "object" &&
          "code" in body.error &&
          typeof body.error.code === "string"
            ? body.error.code
            : undefined
        // Throw a plain safe error instead of an APICallError retaining the
        // authorization response, full prompt, or external provider payload.
        throw new Error(chatGPTErrorMessage(response.status, code))
      }
      return response.body
        ? new Response(sanitizedChatGPTStream(response.body), {
            status: response.status,
            headers: response.headers,
          })
        : response
    },
  }).responses(modelId)
  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: async () => {
      throw new Error("ChatGPT plan requests require streaming.")
    },
    doStream: (options: Parameters<typeof model.doStream>[0]) =>
      model.doStream({
        ...options,
        prompt: normalizeFailedToolCalls(options.prompt),
        providerOptions: {
          ...options.providerOptions,
          openai: {
            ...options.providerOptions?.openai,
            store: false,
            systemMessageMode: "developer",
          },
        },
        tools: options.tools?.map((tool) =>
          tool.type === "function"
            ? {
                ...tool,
                providerOptions: {
                  ...tool.providerOptions,
                  openai: {
                    ...tool.providerOptions?.openai,
                    namespace: {
                      name: "krafty",
                      description:
                        "Krafty teammate tools, executed by the application on behalf of the user.",
                    },
                  },
                },
              }
            : tool
        ),
      }),
  }
}
