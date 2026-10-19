import { sealInputRecord } from "@/lib/chat-content-seal"

// Trigger.dev caps a record at 1 MiB; leave room for the sealing overhead
const MAX_BODY_BYTES = 1024 * 1024

type Deps = {
  contentKey: (chatId: string) => Promise<Buffer | undefined>
  fetch: typeof fetch
  baseURL: string
}

async function defaultContentKey(chatId: string) {
  const { ensureChatContentKey } = await import("@/lib/chat-content-key")
  return ensureChatContentKey(chatId)
}

function json(status: number, error: string) {
  return Response.json({ error }, { status })
}

// The scopes a session token claims, read without verifying it. Trigger.dev
// verifies the token when the append is forwarded; this only turns away a
// request that can't be for this session before the database is touched.
function claimsWrite(authorization: string | null, session: string) {
  const token = authorization?.match(/^Bearer (\S+)$/)?.[1]
  const payload = token?.split(".")[1]
  if (!payload) return false
  try {
    const { scopes } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { scopes?: unknown }
    return (
      Array.isArray(scopes) &&
      (scopes.includes(`write:sessions:${session}`) ||
        scopes.includes("write:sessions") ||
        scopes.includes("write:all") ||
        scopes.includes("admin"))
    )
  } catch {
    return false
  }
}

// The chat transport's `.in/append`, routed through the server so what a
// person writes reaches Trigger.dev only sealed with the chat's key
// (lib/chat-content-seal.ts). The client's own session token authorizes the
// forwarded append, so this grants nothing the token doesn't: it never returns
// ciphertext and never uses the secret key.
export async function proxyChatInput(
  request: Request,
  session: string,
  deps: Deps = {
    contentKey: defaultContentKey,
    fetch,
    baseURL: process.env.TRIGGER_API_URL ?? "https://api.trigger.dev",
  }
) {
  const authorization = request.headers.get("authorization")
  if (!claimsWrite(authorization, session))
    return json(401, "Invalid session token")

  const body = await request.text()
  if (Buffer.byteLength(body) > MAX_BODY_BYTES)
    return json(413, "Message too large")

  const key = await deps.contentKey(session)
  if (!key) return json(404, "Chat not found")
  const sealed = sealInputRecord(body, session, key)
  if (sealed === undefined) return json(400, "Invalid record")

  const partId = request.headers.get("x-part-id")
  const upstream = await deps.fetch(
    `${deps.baseURL}/realtime/v1/sessions/${encodeURIComponent(session)}/in/append`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization!,
        "x-trigger-source": request.headers.get("x-trigger-source") ?? "sdk",
        ...(partId && { "X-Part-Id": partId }),
      },
      body: sealed,
      signal: AbortSignal.timeout(15_000),
    }
  )
  // The transport reads the status, error code and seq, so pass them through
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  })
}
