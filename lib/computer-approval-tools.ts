import { createHash } from "node:crypto"

import type { Sandbox } from "@e2b/desktop"
import { tool } from "ai"

import {
  actionForCategory,
  approvalCovers,
  approvalRequiredMessage,
  computerApprovalInputSchema,
  computerHostnameSchema,
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
  MULTIPLE_ENTER_ERROR,
  NOT_APPROVED_ERROR,
  NOTHING_HELD_ERROR,
  OPAQUE_COMMAND_ERROR,
  shellApprovalRequiredMessage,
  shellCommandRisk,
  shellRefusedMessage,
  VIEW_SCREEN_FIRST_ERROR,
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

// A committing gesture the gate refused in this turn, as the guard saw it.
// An approval request for a gesture stores this, never the bot's own label.
export type HeldGesture = {
  action: ComputerAction
  // Read from the address bar by the guard; null when none was visible
  hostname: string | null
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
  // The last committing gesture refused in this turn, if any
  heldGesture: () => HeldGesture | undefined
  // The action a shell command needs, if the shell refused exactly this
  // command in this turn for want of an approval
  heldCommand: (command: string) => ComputerAction | undefined
}

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
  let held: HeldGesture | undefined
  const heldCommands = new Map<string, ComputerAction>()
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
    if (!approval || !usable || !covers(approval))
      throw new Error(NOT_APPROVED_ERROR)
    if (!(await store.spend(approvalId, options)))
      throw new Error(NOT_APPROVED_ERROR)
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
        throw new Error(MULTIPLE_ENTER_ERROR)
      // Remembered before the approval check: a step refused with or without
      // an approvalId is what the next approval request holds
      held = { action, hostname: verdict.hostname }
      if (!approvalId) throw new Error(approvalRequiredMessage(verdict, action))
      const claimed = await spend(approvalId, (approval) =>
        approvalCovers(approval, verdict, title)
      )
      held = undefined
      return { claimed, verdict }
    },
    shell: async (command, approvalId) => {
      const risk = shellCommandRisk(command)
      if (!risk) return {}
      if (risk.kind === "refuse")
        throw new Error(shellRefusedMessage(risk.reason))
      if (declinedComputerAction(declined(), risk.action))
        throw new Error(DECLINED_ERROR)
      if (heldCommandOpaque(command)) throw new Error(OPAQUE_COMMAND_ERROR)
      heldCommands.set(command, risk.action)
      if (!approvalId) throw new Error(shellApprovalRequiredMessage(risk))
      // A command runs once per approval: it can't be repeated in a window
      const claimed = await spend(
        approvalId,
        (approval) =>
          approval.action === risk.action && approval.command === command,
        { once: true }
      )
      heldCommands.delete(command)
      return { claimed }
    },
    complete: (approvalId, outcome) => store.complete(approvalId, outcome),
    heldGesture: () => held,
    heldCommand: (command) => heldCommands.get(command),
  }
}

export function createComputerApprovalTools(
  store: ComputerApprovalStore,
  options: {
    // What this turn's computer gate refused, which is all an approval holds
    gate: Pick<ComputerGate, "heldGesture" | "heldCommand">
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
        "Hold a committing step on the computer for the owner's approval: a click, key or command that sends, posts, submits (grades, forms, records, roster moves), deletes or buys something outside the computer. Use it right after a computer tool says approval is required: it holds that step, recorded as the kind of action the safety check saw, so name it in your sentence. Look at the screen with viewScreen first. Name the site's hostname and one plain sentence of exactly what will happen, including recipients, records or amounts; for a shell command the bash tool held, also pass that exact command; never pass command for a click or key. The turn stops; when the owner approves you get a message with the approvalId. Never use it to retry something the owner declined.",
      inputSchema: computerApprovalInputSchema,
      execute: async (input) => {
        const parsed = computerApprovalInputSchema.parse(input)
        const declined = options.declined?.() ?? []
        if (declinedComputerAction(declined, parsed.action as ComputerAction))
          throw new Error(DECLINED_ERROR)
        // The approval holds what the server refused, as the server
        // classified it (#33). A command counts only if the shell held that
        // exact command; anything else in `command` on a click is dropped,
        // so the card never shows prose as a command to run.
        const commandAction = parsed.command
          ? options.gate.heldCommand(parsed.command)
          : undefined
        const gesture = commandAction ? undefined : options.gate.heldGesture()
        const action = commandAction ?? gesture?.action
        if (!action) throw new Error(NOTHING_HELD_ERROR)
        if (declinedComputerAction(declined, action))
          throw new Error(DECLINED_ERROR)
        const command = commandAction ? parsed.command : undefined
        if (command && heldCommandOpaque(command))
          throw new Error(OPAQUE_COMMAND_ERROR)
        if (!command && !options.screenViewed())
          throw new Error(VIEW_SCREEN_FIRST_ERROR)
        // The site the guard read from the address bar, when it read one
        const seen = gesture?.hostname
          ? computerHostnameSchema.safeParse(gesture.hostname)
          : undefined
        const hostname = seen?.success ? seen.data : parsed.hostname
        const shot = command
          ? undefined
          : await options.preview?.().catch(() => undefined)
        const held = await store.request({
          action,
          summary: parsed.summary,
          hostname,
          ...(command && { command }),
          ...(shot &&
            shot.base64.length <= MAX_PREVIEW_BASE64 && {
              preview: `data:${shot.mediaType};base64,${shot.base64}`,
            }),
        })
        return {
          status: "approval_required" as const,
          approvalId: held.approvalId,
          summary: held.summary,
          toolkit: hostname,
          action,
          message: `Nothing was done. The owner has an approval card and a notification for a "${action}" step on ${hostname}. Tell them in one sentence what will happen once they approve, then stop.`,
        }
      },
    }),
  }
}

export type ComputerApprovalTools = ReturnType<
  typeof createComputerApprovalTools
>
