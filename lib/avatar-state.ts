export type AvatarState =
  | "idle"
  | "queued"
  | "thinking"
  | "working"
  | "responding"
  | "waiting"
  | "complete"
  | "error"

export const avatarStatusLabels: Record<AvatarState, string> = {
  idle: "",
  queued: "Waiting to start…",
  thinking: "Thinking…",
  working: "Working…",
  responding: "Writing a response…",
  waiting: "Waiting for your answer",
  complete: "Done",
  error: "Reply unavailable",
}

// The bot is busy and the person is waiting: these labels shimmer
export function avatarStatusInProgress(state: AvatarState) {
  return ["queued", "thinking", "working", "responding"].includes(state)
}

export function avatarIsAnimated(state: AvatarState) {
  return ["thinking", "working", "responding", "complete"].includes(state)
}
