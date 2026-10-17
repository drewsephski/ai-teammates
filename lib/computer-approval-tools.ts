import { createHash } from "node:crypto"

import type { Sandbox } from "@e2b/desktop"
import { tool } from "ai"

import {
  actionForCategory,
  approvalCovers,
  approvalRequiredMessage,
  computerApprovalInputSchema,
  declinedComputerAction,
  DECLINED_ERROR,
  GUARD_CACHE_MS,
  GUARD_EXHAUSTED_ERROR,
  GUARD_FAILURE_LIMIT,
  GUARD_UNAVAILABLE_ERROR,
  heldCommandOpaque,
  HUMAN_ONLY_ERROR,
  humanOnlyCategory,
  MAX_PREVIEW_BASE64,
  shellCommandRisk,
  windowOpen,
  type ComputerAction,
  type ComputerApprovalInput,
  type ComputerGesture,
  type DeclinedAction,
  type GuardVerdict,
} from "@/lib/computer-approval-policy"

export type ComputerScreenshot = {
  base64: string
  mediaType: string
  width: number
  height: number
}

// Injected so tests run without a database, a computer or a model. Every
// method is scoped to the turn's owner, its current bot and its chat.
export type ComputerApprovalStore = {
  request: (
    input: ComputerApprovalInput & { preview?: string }
  ) => Promise<{ approvalId: string; summary: string }>
  read: (approvalId: string) => Promise<
    | {
        state: string
        action: string | null
        hostname: string | null
        claimedAt: Date | null
        uses: number
        command?: string | null
      }
    | undefined
  >
  // One gesture of an approval, atomically; false when nothing is left.
  // once: only an unspent approval, for steps that must never repeat
  spend: (approvalId: string, options?: { once?: boolean }) => Promise<boolean>
  complete: (
    approvalId: string,
    outcome: { ok: boolean; result: unknown }
  ) => Promise<void>
}

export type ComputerGate = {
  // Inside the computer's lock, before a gesture that may commit: throws to
  // refuse; returns the approval it spent, to record the outcome on
  gesture: (
    sandbox: Sandbox,
    gesture: ComputerGesture,
    approvalId: string | undefined,
    context: { toolCallId: string; signal?: AbortSignal }
  ) => Promise<{ claimed?: string; verdict?: GuardVerdict }>
  shell: (
    command: string,
    approvalId: string | undefined
  ) => Promise<{ claimed?: string }>
  complete: (
    approvalId: string,
    outcome: { ok: boolean; result: unknown }
  ) => Promise<void>
}

const NOT_APPROVED =
  "That approvalId isn't an approved request for this step from this chat, or its time ran out. Nothing was done. Call requestComputerApproval for this step and stop."

function hash(text: string) {
  return createHash("sha256").update(text).digest("hex")
}

export function createComputerGate({
  store,
  check,
  takeScreenshot,
  windowTitle,
  declined = () => [],
  canCheck = () => true,
  now = Date.now,
}: {
  store: ComputerApprovalStore
  // The independent guard (lib/computer-guard.ts), metered by the caller
  check: (input: {
    screenshot: ComputerScreenshot
    gesture: ComputerGesture
    windowTitle?: string
    toolCallId: string
    signal?: AbortSignal
  }) => Promise<GuardVerdict>
  takeScreenshot: (sandbox: Sandbox) => Promise<ComputerScreenshot>
  windowTitle?: (sandbox: Sandbox) => Promise<string | undefined>
  // What the owner declined, from the database, for this turn
  declined?: () => readonly DeclinedAction[]
  // False when the turn can't pay for another check: its guard budget or the
  // account's AI allowance is spent
  canCheck?: () => boolean
  now?: () => number
}): ComputerGate {
  let failures = 0
  // A retried step on an unchanged screen isn't checked, or charged, twice
  const cache = new Map<string, { verdict: GuardVerdict; at: number }>()

  async function spend(
    approvalId: string,
    covers: (approval: {
      action: string | null
      hostname: string | null
      command?: string | null
    }) => boolean,
    options: { once?: boolean } = {}
  ) {
    const approval = await store.read(approvalId)
    const usable =
      approval &&
      (approval.state === "approved" ||
        (!options.once &&
          (approval.state === "running" || approval.state === "executed") &&
          windowOpen(approval, now())))
    if (!approval || !usable || !covers(approval)) throw new Error(NOT_APPROVED)
    if (!(await store.spend(approvalId, options))) throw new Error(NOT_APPROVED)
    return approvalId
  }

  async function verdictFor(
    sandbox: Sandbox,
    gesture: ComputerGesture,
    context: { toolCallId: string; signal?: AbortSignal }
  ) {
    if (failures >= GUARD_FAILURE_LIMIT || !canCheck())
      throw new Error(GUARD_EXHAUSTED_ERROR)
    try {
      const [screenshot, title] = await Promise.all([
        takeScreenshot(sandbox),
        windowTitle?.(sandbox).catch(() => undefined),
      ])
      const key = hash(
        `${hash(screenshot.base64)}:${title ?? ""}:${JSON.stringify(gesture)}`
      )
      const cached = cache.get(key)
      if (cached && now() - cached.at <= GUARD_CACHE_MS)
        return { verdict: cached.verdict, title }
      const verdict = await check({
        screenshot,
        gesture,
        windowTitle: title,
        toolCallId: context.toolCallId,
        signal: context.signal,
      })
      failures = 0
      cache.set(key, { verdict, at: now() })
      return { verdict, title }
    } catch (error) {
      if (context.signal?.aborted) throw error
      failures++
      // Fail closed: an unchecked gesture never runs
      throw new Error(
        failures >= GUARD_FAILURE_LIMIT
          ? GUARD_EXHAUSTED_ERROR
          : GUARD_UNAVAILABLE_ERROR,
        { cause: error }
      )
    }
  }

  return {
    gesture: async (sandbox, gesture, approvalId, context) => {
      const { verdict, title } = await verdictFor(sandbox, gesture, context)
      if (!verdict.commits) return { verdict }
      if (humanOnlyCategory(verdict.category)) throw new Error(HUMAN_ONLY_ERROR)
      const action = actionForCategory(verdict.category)
      if (declinedComputerAction(declined(), action))
        throw new Error(DECLINED_ERROR)
      // One approval use is one Enter: several lines could send several times
      if (
        gesture.tool === "keyboardType" &&
        (gesture.text.match(/[\r\n]/g)?.length ?? 0) > 1
      )
        throw new Error(
          "This would press Enter more than once on a step that commits. Nothing was done. Type one line at a time."
        )
      if (!approvalId) throw new Error(approvalRequiredMessage(verdict, action))
      return {
        claimed: await spend(approvalId, (approval) =>
          approvalCovers(approval, verdict, title)
        ),
        verdict,
      }
    },
    shell: async (command, approvalId) => {
      const risk = shellCommandRisk(command)
      if (!risk) return {}
      if (risk.kind === "refuse")
        throw new Error(
          `This command ${risk.reason}, which isn't allowed. Nothing ran. Use the mouse, keyboard and screen tools instead.`
        )
      if (declinedComputerAction(declined(), risk.action))
        throw new Error(DECLINED_ERROR)
      if (heldCommandOpaque(command))
        throw new Error(
          "Put the data this command sends inline in the command, not in a file or piped input, so the owner approves exactly what is sent. Nothing ran."
        )
      if (!approvalId)
        throw new Error(
          `Approval required: this command ${risk.reason}. Nothing ran. Call requestComputerApproval with action "${risk.action}", the destination's hostname, one sentence of what will happen and the exact command, then stop. After the owner approves, run that same command with the approvalId.`
        )
      // A command runs once per approval: it can't be repeated in a window
      return {
        claimed: await spend(
          approvalId,
          (approval) =>
            approval.action === risk.action && approval.command === command,
          { once: true }
        ),
      }
    },
    complete: (approvalId, outcome) => store.complete(approvalId, outcome),
  }
}

export function createComputerApprovalTools(
  store: ComputerApprovalStore,
  options: {
    // The server's own screenshot for the owner; undefined when the computer
    // isn't available. Not taken for shell commands.
    preview?: () => Promise<ComputerScreenshot | undefined>
    // Whether viewScreen ran in this turn
    screenViewed: () => boolean
    declined?: () => readonly DeclinedAction[]
  }
) {
  return {
    requestComputerApproval: tool({
      description:
        "Hold a committing step on the computer for the owner's approval: a click, key or command that sends, posts, submits (grades, forms, records, roster moves), deletes or buys something outside the computer. Use it when a computer tool says approval is required. Look at the screen with viewScreen first. Name the site's hostname and one plain sentence of exactly what will happen, including recipients, records or amounts; for a shell command, also pass the exact command. The turn stops; when the owner approves you get a message with the approvalId. Never use it to retry something the owner declined.",
      inputSchema: computerApprovalInputSchema,
      execute: async (input) => {
        const parsed = computerApprovalInputSchema.parse(input)
        if (
          declinedComputerAction(
            options.declined?.() ?? [],
            parsed.action as ComputerAction
          )
        )
          throw new Error(DECLINED_ERROR)
        if (parsed.command && heldCommandOpaque(parsed.command))
          throw new Error(
            "Put the data this command sends inline in the command, not in a file or piped input, so the owner approves exactly what is sent."
          )
        if (!parsed.command && !options.screenViewed())
          throw new Error(
            "Look at the screen with viewScreen first, so the owner sees the step they're approving."
          )
        const shot = parsed.command
          ? undefined
          : await options.preview?.().catch(() => undefined)
        const held = await store.request({
          ...parsed,
          ...(shot &&
            shot.base64.length <= MAX_PREVIEW_BASE64 && {
              preview: `data:${shot.mediaType};base64,${shot.base64}`,
            }),
        })
        return {
          status: "approval_required" as const,
          approvalId: held.approvalId,
          summary: held.summary,
          toolkit: parsed.hostname,
          message:
            "Nothing was done. The owner has an approval card and a notification. Tell them in one sentence what will happen once they approve, then stop.",
        }
      },
    }),
  }
}

export type ComputerApprovalTools = ReturnType<
  typeof createComputerApprovalTools
>
