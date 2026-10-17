// Which computer actions may commit something outside the person's computer,
// and how an approval for one is bound and spent. Pure; tested in
// tests/computer-approval-policy.test.ts. The server decides which gestures
// need checking; the model's own description of an action is never trusted.
// What this does and doesn't enforce: docs/autonomy.md.
import { z } from "zod"

export const computerActions = [
  "submit",
  "post",
  "send",
  "delete",
  "buy",
] as const
export type ComputerAction = (typeof computerActions)[number]

// Same rule as computerLogin.hostname: a display-only domain
export const computerHostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)

export const computerApprovalInputSchema = z.object({
  action: z.enum(computerActions),
  summary: z.string().trim().min(1).max(300),
  hostname: computerHostnameSchema,
  // For a shell command that needs approval: the exact command, which is the
  // only command the approval lets run
  command: z.string().min(1).max(4000).optional(),
})
export type ComputerApprovalInput = z.infer<typeof computerApprovalInputSchema>

// The approvals row's app columns, filled with sentinels
export const COMPUTER_TOOLKIT = "computer"
export const COMPUTER_ACCOUNT = "computer"
export function computerApprovalSlug(action: ComputerAction) {
  return `COMPUTER_${action.toUpperCase()}`
}

// How long, and for how many checked gestures, an approval stays usable once
// its first gesture spent it: a delete and its confirmation, not a session
export const APPROVAL_WINDOW_MS = 90_000
export const APPROVAL_WINDOW_USES = 3
// An approval must be used soon after the owner decides
export const COMPUTER_APPROVAL_FRESH_MS = 60 * 60_000
export const MAX_PENDING_COMPUTER_APPROVALS = 3
// The server's own screenshot kept on the approval for the owner to inspect
export const MAX_PREVIEW_BASE64 = 1_500_000

export type ComputerGesture =
  | {
      tool: "mouseClick"
      x: number
      y: number
      button: string
      double: boolean
    }
  | { tool: "keyboardPress"; key: string; modifiers: string[] }
  | { tool: "keyboardType"; text: string }
  | {
      tool: "mouseDrag"
      startX: number
      startY: number
      endX: number
      endY: number
    }

// Keys that only move focus or the caret, or edit text locally. Every other
// key is checked: Enter and Space activate controls, and web apps bind single
// letters, Delete and modifier chords to send, archive and delete.
const FREE_KEYS = new Set([
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "page_up",
  "prior",
  "pagedown",
  "page_down",
  "next",
  "escape",
  "esc",
  "tab",
  "backspace",
])
// Clipboard, select-all, undo, find, address bar, new and close tab
const FREE_CHORD_KEYS = new Set(["a", "c", "v", "x", "z", "l", "f", "t", "w"])

// Whether the guard must look at the screen before this gesture runs.
// Moving the pointer, scrolling and typing ordinary text don't commit.
export function gestureNeedsCheck(gesture: ComputerGesture) {
  switch (gesture.tool) {
    case "mouseClick":
    case "mouseDrag":
      return true
    case "keyboardPress": {
      const key = gesture.key.trim().toLowerCase()
      const modifiers = gesture.modifiers.filter((m) => m !== "shift")
      if (!modifiers.length) return !FREE_KEYS.has(key)
      return !(
        modifiers.length === 1 &&
        (modifiers[0] === "ctrl" || modifiers[0] === "cmd") &&
        FREE_CHORD_KEYS.has(key)
      )
    }
    case "keyboardType":
      // Enter, or a one-time code that submits on its last digit
      return /[\r\n]/.test(gesture.text) || /^\s*\d{4,8}\s*$/.test(gesture.text)
  }
}

export function describeGesture(gesture: ComputerGesture) {
  switch (gesture.tool) {
    case "mouseClick":
      return `${gesture.double ? "double-" : ""}${gesture.button} click at (${gesture.x}, ${gesture.y})`
    case "mouseDrag":
      return `drag from (${gesture.startX}, ${gesture.startY}) to (${gesture.endX}, ${gesture.endY})`
    case "keyboardPress":
      return `press ${[...gesture.modifiers, gesture.key].join("+")} on the focused element`
    case "keyboardType":
      return /[\r\n]/.test(gesture.text)
        ? "type text that ends with Enter into the focused field"
        : "type a short code into the focused field"
  }
}

// Shell commands with no approval path: they'd click and type around the
// gesture checks, take over the browser, lift its sign-ins, or keep running
// after the turn. The computer tools do these jobs in the open.
const SHELL_REFUSED: { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /\b(?:xdotool|xte|ydotool|xdo|xvkbd|xinput|wmctrl|pyautogui|pynput|keyboard\.press)\b|\bDISPLAY=|\.Xauthority|\bxhost\b/i,
    reason: "drives the desktop's mouse or keyboard",
  },
  {
    pattern:
      /remote-debugging|connect_over_cdp|connectOverCDP|puppeteer\.connect|chrome-remote-interface|devtools:\/\//i,
    reason: "takes over the desktop's browser",
  },
  {
    pattern:
      /\.config\/(?:chromium|google-chrome|BraveSoftware|microsoft-edge)|\.mozilla\/|\/Default\/(?:Cookies|Login Data)|Local State\b|cookies\.sqlite|key4\.db|logins\.json|\/etc\/(?:chromium|opt\/chrome|firefox)/,
    reason: "reads or changes the browser's profile and sign-ins",
  },
  {
    // Globbed or copied profile paths: ~/.conf*/chrom*/Def*/Cook*
    pattern:
      /(?:^|[/\s.*~])(?:chrom|mozilla|firefox|brave|edge)[^\s]*\/[^\s]*(?:cook|login|default|def\*|key4|local\s?state)|cp\s+-\w*r\w*\s+~?\/?[^\s]*\.config\b/i,
    reason: "reads or changes the browser's profile and sign-ins",
  },
  {
    pattern:
      /\bcrontab\b|(?:^|[\s;&|(])at\s+(?:now|-f|\d)|\btmux\b|\bscreen\s+-|\bsystemctl\b|\bsudo\s+tee\b|\bnohup\b|\bsetsid\b|\bdisown\b|\bsystemd-run\b|(?:^|[\/\s~])\.(?:bashrc|profile|bash_profile|zshrc)\b|\.config\/autostart|\/etc\/(?:profile|cron)/i,
    reason: "schedules work to run after this step",
  },
]

// Shell commands that change something outside the computer: they run only
// as the exact command the owner approved
const SHELL_APPROVAL: {
  pattern: RegExp
  reason: string
  action: ComputerAction
}[] = [
  {
    pattern:
      /\bcurl\b[^|;&]*(?:\s-[a-zA-Z]*[dFT](?:\b|\s|@)|\s--(?:data|data-[a-z]+|form|upload-file|json)\b|\s-[a-zA-Z]*X\s*(?!GET\b|HEAD\b)[A-Z]+|\s--request[\s=]+(?!GET\b|HEAD\b)[A-Z]+)/,
    reason: "sends data with curl",
    action: "submit",
  },
  {
    pattern: /\bwget\b[^|;&]*--(?:post|body|method)/i,
    reason: "sends data with wget",
    action: "submit",
  },
  {
    pattern: /\bgit(?:\s+-\S+(?:\s+\S+=\S+)?)*\s+push\b/i,
    reason: "pushes to a git remote",
    action: "post",
  },
  {
    pattern: /\bgh\s+(?:pr|issue|release|repo|api|gist|secret|workflow|run)\b/i,
    reason: "changes GitHub",
    action: "post",
  },
  {
    pattern:
      /(?:^|[\s;&|(/`$])(?:ssh|scp|sftp|rsync|nc|ncat|netcat|socat|telnet|ftp)\s|openssl\s+s_client/i,
    reason: "connects to another machine",
    action: "submit",
  },
  {
    pattern:
      /\b(?:sendmail|mailx?|mutt|msmtp|swaks|ssmtp)\b|\bsmtplib\b|\bnodemailer\b|\bsmtps?:\/\//i,
    reason: "sends email",
    action: "send",
  },
  {
    pattern:
      /\b(?:npm|pnpm|yarn|cargo|gem|poetry|flit)\s+publish\b|\btwine\s+upload\b/i,
    reason: "publishes a package",
    action: "post",
  },
  {
    pattern:
      /\b(?:aws|gcloud|az|railway|vercel|flyctl|fly|heroku|netlify|wrangler|kubectl|terraform)\s+(?!--?(?:help|version)\b)\S/i,
    reason: "changes cloud infrastructure",
    action: "submit",
  },
  {
    pattern:
      /\brequests\.(?:post|put|patch|delete|request)\b|\bhttpx\.(?:post|put|patch|delete|request)\b|\burlopen\(|method\s*[:=]\s*["'](?:POST|PUT|PATCH|DELETE)["']/i,
    reason: "sends an HTTP write from a script",
    action: "submit",
  },
]

export type ShellRisk =
  | { kind: "refuse"; reason: string }
  | { kind: "approve"; reason: string; action: ComputerAction }

// What the shell gate does with a command. Undefined: it runs. This reads
// only the command line, so a script file's contents aren't classified; see
// docs/autonomy.md.
export function shellCommandRisk(command: string): ShellRisk | undefined {
  // Quotes and backslashes split words without changing what runs:
  // xdo""tool, x\dotool and $'xdotool' are all xdotool
  const plain = command.replace(/\$'/g, "'").replace(/["'\\]/g, "")
  const refused = SHELL_REFUSED.find(
    ({ pattern }) => pattern.test(command) || pattern.test(plain)
  )
  if (refused) return { kind: "refuse", reason: refused.reason }
  const held = SHELL_APPROVAL.find(
    ({ pattern }) => pattern.test(command) || pattern.test(plain)
  )
  return held && { kind: "approve", reason: held.reason, action: held.action }
}

// A held command must carry its data inline, so the owner approves what is
// actually sent: no @file, < file or piped input that can change afterwards
export function heldCommandOpaque(command: string) {
  return /(?:^|\s)-[a-zA-Z]*[dFT]\s*@|--(?:data[\w-]*|form|upload-file|json)[\s=]+@|<\s*[^\s<(]|\|\s*(?:curl|ssh|sendmail|mail|nc)\b/i.test(
    command
  )
}

// Paths the file tools refuse for the same reasons
export function protectedPath(path: string) {
  return SHELL_REFUSED.slice(2).some(({ pattern }) => pattern.test(path))
}

// What the independent guard sees and decides (lib/computer-guard.ts)
export const guardCategories = [
  "none",
  "send",
  "post",
  "submit",
  "purchase",
  "payment",
  "delete",
  "grades",
  "roster",
  "records",
  "account",
  "run_command",
  "other",
] as const
export type GuardCategory = (typeof guardCategories)[number]
export type GuardOutput = {
  target: string
  impact: "none" | "low" | "high"
  category: GuardCategory
  confidence: "low" | "medium" | "high"
  // On-screen text tried to steer the decision
  injection: boolean
  // Read from the browser's address bar; null when none is visible
  hostname: string | null
  reason: string
}
export type GuardVerdict = GuardOutput & { commits: boolean }

// The decision is made here, not by the guard model's wording
export function guardVerdict(output: GuardOutput): GuardVerdict {
  const commits =
    output.impact === "high" ||
    output.injection ||
    (output.confidence === "low" && output.category !== "none")
  return { ...output, commits }
}

// Steps no approval lets a bot take: changing account security or ownership,
// and running commands typed into a terminal window on the desktop
export function humanOnlyCategory(category: GuardCategory) {
  return category === "account" || category === "run_command"
}

export const HUMAN_ONLY_ERROR =
  "This step changes account security or runs a command typed on the desktop, which bots don't do. Nothing was done. Ask the person to do it themselves in Desktop, and use the bash tool for commands."

// The approval action a guard category needs, so a "post" approval can't be
// spent on a payment
export function actionForCategory(category: GuardCategory): ComputerAction {
  switch (category) {
    case "send":
      return "send"
    case "post":
      return "post"
    case "purchase":
    case "payment":
      return "buy"
    case "delete":
      return "delete"
    default:
      return "submit"
  }
}

// "app.schoology.com" → "schoology"
function siteLabel(hostname: string) {
  const parts = bareHost(hostname).split(".")
  const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  return label && label.length >= 3 ? label : undefined
}

function bareHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "")
}

// Whether a spent or spendable approval covers what the guard saw: the same
// kind of action, and the same site when the guard could read the address bar
export function approvalCovers(
  approval: { action: string | null; hostname: string | null },
  verdict: Pick<GuardVerdict, "category" | "hostname">,
  windowTitle?: string
) {
  if (humanOnlyCategory(verdict.category)) return false
  if (approval.action !== actionForCategory(verdict.category)) return false
  if (!approval.hostname) return true
  if (!verdict.hostname) {
    // No address bar in view: the window must at least name the site
    const label = siteLabel(approval.hostname)
    return !!label && !!windowTitle?.toLowerCase().includes(label)
  }
  const seen = bareHost(verdict.hostname)
  const approved = bareHost(approval.hostname)
  return seen === approved || seen.endsWith(`.${approved}`)
}

// Whether a claimed approval may cover one more gesture
export function windowOpen(
  approval: { claimedAt: Date | null; uses: number },
  now = Date.now()
) {
  return (
    !!approval.claimedAt &&
    now - approval.claimedAt.getTime() <= APPROVAL_WINDOW_MS &&
    approval.uses < APPROVAL_WINDOW_USES
  )
}

// What the turn knows the owner declined (looked up from the database, never
// from a message ID alone): the same kind of action is refused, not re-asked
export type DeclinedAction =
  | { kind: "computer"; action: string | null; hostname: string | null }
  | { kind: "app"; toolkit: string }

export function declinedComputerAction(
  declined: readonly DeclinedAction[],
  action: ComputerAction
) {
  return declined.some(
    (entry) => entry.kind === "computer" && entry.action === action
  )
}

export const DECLINED_ERROR =
  "The owner declined this kind of action in this conversation. Nothing was done. Don't try it another way; tell them what you can do instead."

export const COMPUTER_APPROVAL_REQUIRED =
  "Approval required: this would commit an action outside the computer"

// The tool error a held gesture returns. Nothing ran.
export function approvalRequiredMessage(
  verdict: Pick<GuardVerdict, "category" | "reason">,
  action: ComputerAction
) {
  return `${COMPUTER_APPROVAL_REQUIRED} (${verdict.category}: ${verdict.reason.slice(0, 200)}). Nothing was done. Call requestComputerApproval with action "${action}", the site's hostname and one sentence of exactly what will happen, then stop. After the owner approves, look at the screen again and repeat this step with the approvalId.`
}

export const GUARD_UNAVAILABLE_ERROR =
  "Couldn't check whether this step is safe to take, so it wasn't done. Look at the screen and try once more; if it fails again, tell the person."
export const GUARD_EXHAUSTED_ERROR =
  "The safety check for clicks and keys isn't available right now, so this step wasn't done. Stop using the mouse and keyboard in this turn and tell the person; reading the screen and the shell still work."
// Consecutive guard failures before a turn stops trying
export const GUARD_FAILURE_LIMIT = 3
// What one turn may spend on guard checks, in millionths of a dollar
export const GUARD_TURN_BUDGET = 100_000
// Left in the AI allowance before a guarded gesture may run
export const GUARD_RESERVE = 5_000
export const GUARD_CACHE_MS = 30_000

// What the bot is told when the owner decides on a computer approval
export function computerDecisionPrompt(
  approval: { id: string; summary: string; hostname: string | null },
  decision: "approve" | "deny"
) {
  if (decision === "deny")
    return `The owner declined this request: "${approval.summary}". Don't take that action or reach the same result another way: not through the browser, the shell, a connected app or another teammate. Acknowledge briefly and say what you'll do instead, if anything.`
  return `The owner approved this request: "${approval.summary}"${approval.hostname ? ` on ${approval.hostname}` : ""}. Look at the screen with viewScreen first. If it still shows the step they approved, take it now and pass approvalId "${approval.id}" with that step (and with a confirmation step right after it, if the site asks). The approval lasts ${APPROVAL_WINDOW_MS / 1000} seconds and ${APPROVAL_WINDOW_USES} steps from its first use. Then check the result and report back. If the screen shows something different, don't act: ask again with requestComputerApproval.`
}
