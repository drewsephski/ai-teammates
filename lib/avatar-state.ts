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

export function avatarIsAnimated(state: AvatarState) {
  return ["thinking", "working", "responding", "complete"].includes(state)
}
