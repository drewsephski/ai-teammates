import { ApiError, runs, sessions } from "@trigger.dev/sdk"

// Erases what Trigger.dev holds for a chat's session, before the chat is
// deleted. What can be removed is removed; the rest is unreadable without the
// chat's key, which goes with the chat row (lib/chat-content-seal.ts):
//
// - `.out` (reply chunks, tool results): trimmed to nothing with S2's trim
//   command, which deletes the records. Possible only while the session is
//   open, so this runs before closing it.
// - The transcript snapshot (`chat.agent`'s default storage, still holding
//   chats from before transcripts moved to Neon): overwritten with an empty one.
// - Session metadata and tags (For you binding, delegation links): replaced
//   with an erasure marker.
// - `.in` (what the person wrote) and the trace attribute the SDK copies from
//   it: Trigger.dev keeps them and offers no delete, which is why they are
//   sealed. Records appended before sealing shipped stay readable there.
//
// Then the session is closed, and the run cancelled first so it can't write
// again. Each step can run again; see docs/data-retention.md.

export const ERASED_TAG = "erased"

type SessionState = {
  open: boolean
  runId?: string | null
  erased: boolean
}

export type ErasureSteps = {
  retrieve: (chatId: string) => Promise<SessionState | undefined>
  stopRun: (runId: string) => Promise<void>
  trimOutput: (chatId: string) => Promise<void>
  clearSnapshot: (chatId: string) => Promise<void>
  markErased: (chatId: string) => Promise<void>
  close: (chatId: string, reason: string) => Promise<void>
  // Throws while Trigger.dev still serves part of the conversation
  verify: (chatId: string) => Promise<void>
}

function triggerAccess() {
  const baseURL = process.env.TRIGGER_API_URL ?? "https://api.trigger.dev"
  const accessToken =
    process.env.TRIGGER_SECRET_KEY ?? process.env.TRIGGER_ACCESS_TOKEN
  if (!accessToken) throw new Error("Trigger.dev is not configured")
  return { baseURL, headers: { Authorization: `Bearer ${accessToken}` } }
}

async function triggerFetch(path: string, init: RequestInit = {}) {
  const { baseURL, headers } = triggerAccess()
  return fetch(`${baseURL}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  })
}

const sessionPath = (chatId: string) =>
  `/api/v1/sessions/${encodeURIComponent(chatId)}`

// An empty `chat.agent` snapshot (version 2, as the SDK writes it)
const EMPTY_SNAPSHOT = () =>
  JSON.stringify({ version: 2, savedAt: Date.now(), messages: [], state: null })

export const triggerErasureSteps: ErasureSteps = {
  retrieve: async (chatId) => {
    try {
      const session = await sessions.retrieve(chatId)
      const expired =
        session.expiresAt !== null && session.expiresAt.getTime() <= Date.now()
      return {
        open: session.closedAt === null && !expired,
        runId: session.currentRunId,
        erased: typeof session.metadata?.erasedAt === "string",
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return
      throw cause
    }
  },
  stopRun: async (runId) => {
    try {
      await runs.cancel(runId)
    } catch (cause) {
      // Already finished
      if (cause instanceof ApiError && (cause.status ?? 500) < 500) return
      throw cause
    }
    // A cancelled run can still be flushing; give it a moment to stop writing
    for (let attempt = 0; attempt < 10; attempt++) {
      const run = await runs.retrieve(runId)
      if (run.isCompleted) return
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  },
  trimOutput: async (chatId) => {
    // Past the tail: S2 trims through the trim command itself
    await sessions.open(chatId).out.trimTo(Number.MAX_SAFE_INTEGER)
  },
  clearSnapshot: async (chatId) => {
    const read = await triggerFetch(`${sessionPath(chatId)}/snapshot-url`)
    if (read.status === 404) return
    if (!read.ok) throw new Error(`Snapshot lookup failed (${read.status})`)
    const { presignedUrl } = (await read.json()) as { presignedUrl: string }
    const current = await fetch(presignedUrl, {
      signal: AbortSignal.timeout(15_000),
    })
    // No snapshot was ever written
    if (current.status === 404 || current.status === 403) return
    if (!current.ok) throw new Error(`Snapshot read failed (${current.status})`)
    const { messages } = (await current.json().catch(() => ({}))) as {
      messages?: unknown[]
    }
    if (Array.isArray(messages) && messages.length === 0) return

    const write = await triggerFetch(`${sessionPath(chatId)}/snapshot-url`, {
      method: "PUT",
    })
    if (!write.ok) throw new Error(`Snapshot upload failed (${write.status})`)
    const upload = (await write.json()) as { presignedUrl: string }
    const put = await fetch(upload.presignedUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: EMPTY_SNAPSHOT(),
      signal: AbortSignal.timeout(15_000),
    })
    if (!put.ok) throw new Error(`Snapshot overwrite failed (${put.status})`)
  },
  markErased: async (chatId) => {
    await sessions.update(chatId, {
      metadata: { erasedAt: new Date().toISOString() },
      tags: [ERASED_TAG],
    })
  },
  close: async (chatId, reason) => {
    try {
      await sessions.close(chatId, { reason })
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return
      throw cause
    }
  },
  verify: async (chatId) => {
    const response = await triggerFetch(`${sessionPath(chatId)}/transcript`)
    if (response.status === 404) return
    if (!response.ok)
      throw new Error(`Transcript check failed (${response.status})`)
    const { messages } = (await response.json()) as { messages?: unknown[] }
    if (messages?.length)
      throw new Error("Trigger.dev still serves this chat's transcript")
  },
}

export async function eraseChatSession(
  chatId: string,
  reason: string,
  steps: ErasureSteps = triggerErasureSteps
): Promise<"absent" | "already erased" | "erased"> {
  const session = await steps.retrieve(chatId)
  if (!session) return "absent"
  if (session.erased && !session.open) return "already erased"

  if (session.open) {
    if (session.runId) await steps.stopRun(session.runId)
    await steps.trimOutput(chatId)
  }
  await steps.clearSnapshot(chatId)
  await steps.markErased(chatId)
  if (session.open) await steps.close(chatId, reason)
  await steps.verify(chatId)
  return "erased"
}

export type SweepSteps = {
  // Chat sessions, oldest first or in any order
  list: () => AsyncIterable<{
    externalId: string | null
    createdAt: Date
    erased: boolean
  }>
  existingChats: (chatIds: string[]) => Promise<Set<string>>
  erase: (chatId: string) => Promise<unknown>
}

// Erases sessions whose chat no longer exists: chats deleted before erasure
// shipped, and any erasure that failed when its chat was deleted. A session
// younger than `minAgeMs` is left alone, so one started just before its chat
// row commits isn't mistaken for an orphan.
export async function sweepOrphanSessions(
  steps: SweepSteps,
  {
    limit = 200,
    minAgeMs = 60 * 60 * 1000,
    now = Date.now(),
  }: { limit?: number; minAgeMs?: number; now?: number } = {}
) {
  let erased = 0
  let failed = 0
  let batch: string[] = []

  async function flush() {
    const existing = await steps.existingChats(batch)
    for (const chatId of batch) {
      if (existing.has(chatId) || erased + failed >= limit) continue
      try {
        await steps.erase(chatId)
        erased++
      } catch {
        failed++
      }
    }
    batch = []
  }

  for await (const session of steps.list()) {
    if (erased + failed >= limit) break
    if (!session.externalId || session.erased) continue
    if (now - session.createdAt.getTime() < minAgeMs) continue
    batch.push(session.externalId)
    if (batch.length >= 100) await flush()
  }
  if (batch.length) await flush()
  return { erased, failed }
}
