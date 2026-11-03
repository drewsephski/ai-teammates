export const CHAT_SESSION_ERROR = "Invalid chat session"

// Both identifiers must describe the same session, including chats belonging
// to one owner. Content and clientData are never an authority for identity.
export function assertChatSessionId(
  trusted: unknown,
  candidate: unknown
): asserts candidate is string {
  if (typeof trusted !== "string" || !trusted || candidate !== trusted)
    throw new Error(CHAT_SESSION_ERROR)
}

export function inputRecordMatchesSession(body: string, session: string) {
  let record: unknown
  try {
    record = JSON.parse(body)
  } catch {
    return false
  }
  if (!record || typeof record !== "object" || Array.isArray(record))
    return false
  const { kind, payload } = record as { kind?: unknown; payload?: unknown }
  // Stop and handover control records have no wire chatId.
  if (kind !== "message") return true
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false
  try {
    assertChatSessionId(session, (payload as { chatId?: unknown }).chatId)
    return true
  } catch {
    return false
  }
}
