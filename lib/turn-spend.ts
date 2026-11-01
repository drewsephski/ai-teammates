// What a reply spent of the Krafty AI allowance, what Krafty gave back, and
// why it stopped early. Pure: trigger/chat.ts meters and records the spend,
// the chat shows it (components/chat-turn-usage.tsx). Amounts are millionths
// of a dollar, as in usage_entries.

// The limits a person can put on one task of a bot (bots.taskBudget):
// 5¢, 25¢, $1 and $5. Null means only the account's allowance applies.
export const TASK_BUDGETS = [50_000, 250_000, 1_000_000, 5_000_000] as const
export type TaskBudget = (typeof TASK_BUDGETS)[number]

export function isTaskBudget(value: number): boolean {
  return (TASK_BUDGETS as readonly number[]).includes(value)
}

// A reply that takes the same step with the same result this many times in a
// row is going round in circles, so it stops
export const LOOP_STEP_LIMIT = 6

// Stored on the reply as its `data-turnUsage` part, so it outlives a reload
// and a continuation turn can add up what its task spent before it
export type TurnUsage = {
  // AI allowance the reply used: model steps (unless the person's ChatGPT
  // plan paid for them), web searches, teammate consultations, computer checks
  // and follow-up suggestions
  spent: number
  // Given back: everything when the reply failed, the repeats when it looped
  credited: number
  // The model ran on the person's ChatGPT plan
  chatgpt: boolean
  failed: boolean
  stop?: "budget" | "loop"
  // The bot's limit per task, when it has one
  budget?: number
}

// Whether a reply ended without finishing. Trigger.dev reports a model that
// failed partway as a missing or "error" finish reason, not as an error;
// something that threw arrives as `error`. Stopping a reply, or being refused
// for allowance before anything ran, isn't a failure.
export function turnFailed(turn: {
  error?: unknown
  refused: boolean
  stopped: boolean
  finishReason?: string
}) {
  if (turn.stopped || turn.refused) return false
  return (
    !!turn.error ||
    turn.finishReason === undefined ||
    turn.finishReason === "error"
  )
}

type StepPart = {
  type: string
  toolName?: string
  input?: unknown
  output?: unknown
  error?: unknown
}

// The tool calls a step made and what came back, without the call IDs, which
// differ every time. Undefined for a step that called no tool.
export function stepFingerprint(content: readonly StepPart[]) {
  const tools = content.flatMap((part) =>
    part.type === "tool-call"
      ? [["call", part.toolName, part.input]]
      : part.type === "tool-result"
        ? [["result", part.toolName, part.output]]
        : part.type === "tool-error"
          ? [["error", part.toolName, String(part.error)]]
          : []
  )
  return tools.length ? JSON.stringify(tools) : undefined
}

// How many of the last steps are the same step, repeated. 0 when the last
// step called no tool.
export function repeatedSteps(
  steps: readonly { content: readonly StepPart[] }[]
) {
  const last = steps.at(-1)
  const print = last && stepFingerprint(last.content)
  if (!print) return 0
  let count = 0
  for (let index = steps.length - 1; index >= 0; index--) {
    if (stepFingerprint(steps[index].content) !== print) break
    count++
  }
  return count
}

// What Krafty gives back for a reply: everything it spent when it failed,
// and every repeat after the first when it stopped a loop. `stepSpends` is
// what each step spent, in order.
export function turnCredit(turn: {
  spent: number
  failed: boolean
  repeated: number
  stepSpends: readonly number[]
}) {
  const credit = turn.failed
    ? turn.spent
    : turn.repeated > 1
      ? turn.stepSpends
          .slice(-(turn.repeated - 1))
          .reduce((sum, spend) => sum + spend, 0)
      : 0
  return Math.max(0, Math.min(turn.spent, Math.round(credit)))
}

type StoredMessage = {
  id: string
  role: string
  parts: readonly { type: string; data?: unknown }[]
}

// What the task a continuation turn carries on has spent already: every
// reply since the message that started it, less what Krafty gave back
export function priorTaskSpend(
  messages: readonly StoredMessage[],
  rootMessageId: string
) {
  const start = messages.findIndex((message) => message.id === rootMessageId)
  if (start === -1) return 0
  let total = 0
  for (const message of messages.slice(start + 1)) {
    if (message.role !== "assistant") continue
    for (const part of message.parts) {
      if (part.type !== "data-turnUsage") continue
      const data = part.data as Partial<TurnUsage> | undefined
      const spent = typeof data?.spent === "number" ? data.spent : 0
      const credited = typeof data?.credited === "number" ? data.credited : 0
      total += Math.max(0, spent - credited)
    }
  }
  return total
}

export function taskBudgetReached(
  budget: number | null | undefined,
  spent: number
) {
  return budget != null && budget > 0 && spent >= budget
}

// "0.4¢", "<0.1¢", "12¢", "$1.20"
export function formatSpend(amount: number) {
  if (amount <= 0) return "0¢"
  const cents = amount / 10_000
  if (cents < 0.1) return "<0.1¢"
  if (cents < 9.95) return `${Number(cents.toFixed(1))}¢`
  if (Math.round(cents) < 100) return `${Math.round(cents)}¢`
  return `$${(amount / 1_000_000).toFixed(2)}`
}

// "5¢", "25¢", "$1", "$5"
export function formatBudget(budget: number) {
  return budget < 1_000_000
    ? `${Math.round(budget / 10_000)}¢`
    : `$${Number((budget / 1_000_000).toFixed(2))}`
}

// What the reply cost, net of anything given back. Undefined when it cost
// nothing worth showing.
export function turnUsageLabel(usage: TurnUsage) {
  const net = Math.max(0, usage.spent - usage.credited)
  return net > 0 ? formatSpend(net) : undefined
}

// The sentence under a reply that stopped early or got its spend back
export function turnUsageNote(usage: TurnUsage) {
  if (usage.stop === "budget" && usage.budget)
    return `Stopped at this bot's ${formatBudget(usage.budget)} limit per task. Reply to keep going.`
  if (usage.stop === "loop")
    return usage.credited > 0
      ? `Stopped because it kept repeating the same step. Krafty gave back the ${formatSpend(usage.credited)} the repeats used.`
      : "Stopped because it kept repeating the same step."
  if (usage.failed && usage.credited > 0)
    return `This reply didn't finish. Krafty gave back the ${formatSpend(usage.credited)} it used.`
  return undefined
}
