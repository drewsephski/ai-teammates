// The chat a delegated chat was handed over from. Delegation stores it in the
// destination's Trigger session metadata (lib/team-delegation.ts); nothing in
// the database links the two.
export function delegationSourceId(
  metadata: unknown,
  chatId: string
): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined
  const source = (metadata as { sourceChatId?: unknown }).sourceChatId
  return typeof source === "string" && source && source !== chatId
    ? source
    : undefined
}
