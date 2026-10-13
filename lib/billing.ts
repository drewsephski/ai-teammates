// Both plans include bots; cloud computers are a paid feature.
export type Feature = "bots" | "sandboxes"

// Thrown by the chat agent, and recognised by the chat, when a turn can't start
// because the billing period's allowance is spent
export const USAGE_LIMIT_ERROR =
  "You've used up your AI allowance. View your usage or upgrade to continue."
