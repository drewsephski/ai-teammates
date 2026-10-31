import type { Sandbox } from "@e2b/desktop"
import { tool, type InferUITools, type UIMessage } from "ai"
import { z } from "zod"

import { withComputer, runSandboxCommand } from "@/lib/e2b"
import { isComputerBusy, type ComputerBusy } from "@/lib/computer-lease-policy"
import {
  gestureNeedsCheck,
  protectedPath,
  shellCommandRisk,
  type ComputerGesture,
} from "@/lib/computer-approval-policy"
import type { ComputerGate } from "@/lib/computer-approval-tools"
import { sandboxPath } from "@/lib/sandbox-policy"
import { redactSecrets } from "@/lib/secret-policy"
import type { HandoffTools } from "@/lib/handoff-tool"

// Enough for a model to work with, without one noisy command filling its context
const MAX_TEXT_LENGTH = 20_000

// The browser's profile and the places that run things later stay off limits
// to the file tools, as they are to the shell
function allowedPath(path: string) {
  const resolved = sandboxPath(path)
  if (protectedPath(resolved) || protectedPath(path))
    throw new Error(
      "That path holds the browser's sign-ins or start-up settings, which bots can't read or change. Nothing was done."
    )
  return resolved
}

function truncate(text: string) {
  if (text.length <= MAX_TEXT_LENGTH) return text
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n… truncated ${text.length - MAX_TEXT_LENGTH} more characters`
}

// What the model may see of command output or a file: every saved key's value
// becomes `[secret NAME]`. Redacted before truncating, so a value cut in two
// at the limit can't slip through half-hidden.
export function modelText(text: string, secrets: Record<string, string> = {}) {
  return truncate(redactSecrets(text, secrets))
}

const point = {
  x: z.number().int().describe("Pixels from the left edge of the screen"),
  y: z.number().int().describe("Pixels from the top edge of the screen"),
}
// Only after the owner approved this exact step (requestComputerApproval)
const approvalId = z
  .string()
  .min(1)
  .max(100)
  .optional()
  .describe(
    "The approvalId from the owner's approval message, only when repeating the step they approved"
  )

export async function takeScreenshot(sandbox: Sandbox) {
  const [shot, screen] = await Promise.all([
    sandbox.screenshot(),
    sandbox.getScreenSize(),
  ])
  if (!shot.byteLength) throw new Error("The screenshot came back empty")
  return {
    base64: Buffer.from(shot).toString("base64"),
    mediaType: "image/png",
    width: screen.width,
    height: screen.height,
  }
}

type Screenshot = Awaited<ReturnType<typeof takeScreenshot>>
// The model gets the picture itself rather than its base64 as text
function screenshotToModelOutput({ output }: { output: Screenshot }) {
  if (isComputerBusy(output))
    return {
      type: "text" as const,
      value: `The computer is busy: ${output.heldBy} is using it. Don't retry in a loop.`,
    }
  return {
    type: "content" as const,
    value: [
      {
        type: "text" as const,
        text: `Screenshot of the ${output.width}x${output.height} screen. Coordinates are in pixels from the top left.`,
      },
      {
        type: "file" as const,
        mediaType: output.mediaType,
        data: { type: "data" as const, data: output.base64 },
      },
    ],
  }
}

// The person's computer as a tool set. It is only looked up, woken and renewed
// when a tool needs it. `getComputer` runs on every call: it takes or renews
// this turn's lease, so it returns a busy result while another of the person's
// bots has the computer, and paused sessions never leave stale clients.
export function createSandboxTools(
  // holdMs: how long the call may run, so its lease outlasts it
  getComputer: (
    holdMs?: number
  ) => string | ComputerBusy | Promise<string | ComputerBusy>,
  // Checks every gesture or command that could commit an action outside the
  // computer, and holds it for the owner's approval (lib/computer-approval-tools.ts)
  gate: Pick<ComputerGate, "gesture" | "shell" | "complete">,
  options: {
    onScreenViewed?: () => void
    // Runs when a computer call ends, so the lease counts from the last call
    // finishing rather than starting
    afterCall?: () => Promise<unknown> | unknown
    // The person's saved API keys (lib/user-secrets.ts). Read on every call,
    // so a key saved mid-chat works, set as environment variables in bash and
    // redacted from what the model reads
    secretEnv?: () => Promise<Record<string, string>>
  } = {}
) {
  const secretEnv = async () => (await options.secretEnv?.()) ?? {}

  // When each call still in flight may end. A step's tool calls run in
  // parallel, so a short call's renewal must not cut a long command's lease.
  const inFlight: number[] = []
  async function runInSandbox<T>(
    operation: (sandbox: Sandbox) => Promise<T>,
    leaseMs?: number,
    holdMs = 0
  ): Promise<T> {
    const now = Date.now()
    const until = now + holdMs
    const longest = Math.max(until, ...inFlight)
    inFlight.push(until)
    try {
      const computer = await getComputer(longest - now)
      // Busy is kept out of the declared output types, so every renderer of a
      // tool part checks for it with isComputerBusy before reading an output
      if (typeof computer !== "string") return computer as unknown as T
      try {
        return await withComputer(computer, operation, leaseMs)
      } finally {
        await Promise.resolve(options.afterCall?.()).catch(() => {})
      }
    } finally {
      inFlight.splice(inFlight.indexOf(until), 1)
    }
  }

  // Runs a gesture once the gate let it through, and records the outcome on
  // the approval it spent, if any
  async function guarded<T>(
    sandbox: Sandbox,
    gesture: ComputerGesture,
    approval: string | undefined,
    context: { toolCallId: string; abortSignal?: AbortSignal },
    run: () => Promise<T>
  ) {
    const { claimed, verdict } = gestureNeedsCheck(gesture)
      ? await gate.gesture(sandbox, gesture, approval, {
          toolCallId: context.toolCallId,
          signal: context.abortSignal,
        })
      : {}
    try {
      const result = await run()
      if (claimed)
        await gate.complete(claimed, {
          ok: true,
          result: { gesture, verdict },
        })
      return result
    } catch (error) {
      if (claimed)
        await gate.complete(claimed, {
          ok: false,
          result: {
            gesture,
            verdict,
            error: error instanceof Error ? error.message : "failed",
          },
        })
      throw error
    }
  }

  return {
    bash: tool({
      description:
        "Run a shell command on the computer and get its output and exit code. Commands start in your home directory unless you pass cwd, and each call is a fresh shell.",
      inputSchema: z.object({
        command: z.string().describe("The shell command to run"),
        cwd: z.string().optional().describe("Directory to run the command in"),
        timeout: z
          .number()
          .int()
          .min(1)
          .max(600)
          .optional()
          .describe("Seconds to wait before giving up. Defaults to 60."),
        approvalId,
      }),
      execute: async (
        { command, cwd, timeout = 60, approvalId },
        { abortSignal }
      ) => {
        // A held command is refused before the computer is touched
        if (!approvalId && shellCommandRisk(command))
          await gate.shell(command, undefined)
        return runInSandbox(
          async (sandbox) => {
            // Spent only once this turn has the computer, so a busy computer
            // never burns an approval
            const { claimed } = approvalId
              ? await gate.shell(command, approvalId)
              : {}
            try {
              const envs = await secretEnv()
              // Stop kills the command: the computer is shared with other bots
              const response = await runSandboxCommand(
                sandbox,
                command,
                cwd ? allowedPath(cwd) : undefined,
                timeout * 1000,
                abortSignal,
                Object.keys(envs).length ? envs : undefined
              )
              const result = {
                exitCode: response.exitCode,
                output: modelText(response.stdout + response.stderr, envs),
              }
              if (claimed)
                await gate.complete(claimed, {
                  ok: response.exitCode === 0,
                  result: { command, exitCode: response.exitCode },
                })
              return result
            } catch (error) {
              if (claimed)
                await gate.complete(claimed, {
                  ok: false,
                  result: {
                    command,
                    error: error instanceof Error ? error.message : "failed",
                  },
                })
              throw error
            }
          },
          Math.max(5 * 60_000, (timeout + 30) * 1000),
          (timeout + 30) * 1000
        )
      },
    }),

    readFile: tool({
      description: "Read a text file from the computer.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("File path, absolute or relative to your home directory"),
      }),
      execute: async ({ path }) =>
        runInSandbox(async (sandbox) => {
          const file = await sandbox.files.read(allowedPath(path))
          return { content: modelText(file, await secretEnv()) }
        }),
    }),

    writeFile: tool({
      description:
        "Write a text file on the computer, creating it and any missing folders, or replacing it if it exists.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("File path, absolute or relative to your home directory"),
        content: z.string().describe("The full new content of the file"),
      }),
      execute: async ({ path, content }) =>
        runInSandbox(async (sandbox) => {
          const file = Buffer.from(content, "utf8")
          await sandbox.files.write(allowedPath(path), content)
          return { path, bytes: file.byteLength }
        }),
    }),

    listFiles: tool({
      description: "List the files and folders in a directory on the computer.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe(
            "Directory path, absolute or relative to your home directory"
          ),
      }),
      execute: async ({ path }) =>
        runInSandbox(async (sandbox) => {
          const files = await sandbox.files.list(allowedPath(path))
          return {
            files: files.map((file) => ({
              name: file.name,
              isDir: file.type === "dir",
              size: file.size,
            })),
          }
        }),
    }),

    mouseClick: tool({
      description:
        "Click the mouse at a point on the computer's desktop. Look at the screen first to find the coordinates.",
      inputSchema: z.object({
        ...point,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false).describe("Double-click"),
        approvalId,
      }),
      execute: async ({ x, y, button, double, approvalId }, context) =>
        runInSandbox((sandbox) =>
          guarded(
            sandbox,
            { tool: "mouseClick", x, y, button, double },
            approvalId,
            context,
            async () => {
              const click =
                button === "right"
                  ? sandbox.rightClick.bind(sandbox)
                  : button === "middle"
                    ? sandbox.middleClick.bind(sandbox)
                    : sandbox.leftClick.bind(sandbox)
              if (double && button === "left") await sandbox.doubleClick(x, y)
              else {
                await click(x, y)
                if (double) await click(x, y)
              }
              return { x, y }
            }
          )
        ),
    }),

    mouseMove: tool({
      description:
        "Move the mouse cursor to a point on the computer's desktop without clicking.",
      inputSchema: z.object(point),
      execute: async ({ x, y }) =>
        runInSandbox(async (sandbox) => {
          await sandbox.moveMouse(x, y)
          return { x, y }
        }),
    }),

    mouseDrag: tool({
      description:
        "Press the left mouse button at one point on the computer's desktop, drag to another and release.",
      inputSchema: z.object({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
        approvalId,
      }),
      execute: async ({ startX, startY, endX, endY, approvalId }, context) =>
        runInSandbox((sandbox) =>
          guarded(
            sandbox,
            { tool: "mouseDrag", startX, startY, endX, endY },
            approvalId,
            context,
            async () => {
              await sandbox.drag([startX, startY], [endX, endY])
              return { x: endX, y: endY }
            }
          )
        ),
    }),

    mouseScroll: tool({
      description:
        "Scroll the mouse wheel at a point on the computer's desktop.",
      inputSchema: z.object({
        ...point,
        direction: z.enum(["up", "down"]),
        amount: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(3)
          .describe("Wheel notches; each moves a few lines"),
      }),
      execute: async ({ x, y, direction, amount }) =>
        runInSandbox(async (sandbox) => {
          await sandbox.moveMouse(x, y)
          await sandbox.scroll(direction, amount)
          return { x, y, direction, amount }
        }),
    }),

    keyboardType: tool({
      description:
        "Type text into whatever has keyboard focus on the computer's desktop. Newlines are typed as Enter.",
      inputSchema: z.object({
        text: z.string().describe("The text to type"),
        approvalId,
      }),
      execute: async ({ text, approvalId }, context) =>
        runInSandbox((sandbox) =>
          guarded(
            sandbox,
            { tool: "keyboardType", text },
            approvalId,
            context,
            async () => {
              await sandbox.write(text)
              return { typed: text.length }
            }
          )
        ),
    }),

    keyboardPress: tool({
      description:
        "Press a single key on the computer's desktop, optionally with modifiers held, e.g. key 'enter', or key 'c' with modifiers ['ctrl'].",
      inputSchema: z.object({
        // A keysym name only: the key reaches xdotool on the computer's shell
        key: z
          .string()
          .regex(
            /^[A-Za-z0-9_]{1,32}$/,
            "Use a single key name such as enter, tab or a."
          )
          .describe(
            "A key name: a letter or digit, enter, escape, tab, backspace, delete, space, up, down, left, right, home, end, pageup, pagedown, f1-f12"
          ),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).default([]),
        approvalId,
      }),
      execute: async ({ key, modifiers, approvalId }, context) =>
        runInSandbox((sandbox) =>
          guarded(
            sandbox,
            { tool: "keyboardPress", key, modifiers },
            approvalId,
            context,
            async () => {
              await sandbox.press([
                ...modifiers.map((modifier) =>
                  modifier === "cmd" ? "super" : modifier
                ),
                key,
              ])
              return { key, modifiers }
            }
          )
        ),
    }),

    viewScreen: tool({
      description:
        "Look at the computer's desktop yourself. Use this whenever you need to see the screen to do your work, such as before clicking and after an action to check what happened. The person you are talking to does not see this screenshot.",
      inputSchema: z.object({}),
      execute: async () => {
        const screenshot = await runInSandbox(takeScreenshot)
        if (!isComputerBusy(screenshot)) options.onScreenViewed?.()
        return screenshot
      },
      toModelOutput: screenshotToModelOutput,
    }),

    showScreen: tool({
      description:
        "Show the computer's desktop to the person you are talking to: the screenshot appears in the chat, and you see it too. Use this only when they ask to see the screen or what is on it.",
      inputSchema: z.object({}),
      execute: async () => runInSandbox(takeScreenshot),
      toModelOutput: screenshotToModelOutput,
    }),
  }
}

export type SandboxTools = ReturnType<typeof createSandboxTools>
// A reply carries the bot that started it and a group chat's message the bot it
// was sent to, so the chat can show who answered whom
export type ChatMessageMetadata = {
  botId?: string
  questionId?: string
  mentions?: import("@/lib/composer").BotMention[]
  displayPrompt?: string
}
export type ChatDataParts = {
  messageSeen: { messageId: string; seenAt: string }
  followUps: {
    botId: string
    suggestions: import("@/lib/chat-follow-ups").ChatFollowUp[]
  }
  // What the reply spent, any credit, and why it stopped early
  turnUsage: import("@/lib/turn-spend").TurnUsage
}
export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  ChatDataParts,
  InferUITools<
    SandboxTools &
      import("@/lib/memory-tools").MemoryTools &
      HandoffTools &
      import("@/lib/team-tools").TeamTools &
      import("@/lib/consultation-tool").ConsultationTools &
      import("@/lib/bot-setup-tools").BotSetupTools &
      import("@/lib/composio").ConnectorTools &
      import("@/lib/app-catalog-tools").AppCatalogTools &
      import("@/lib/web-tools").WebTools &
      import("@/lib/routine-tools").RoutineTools &
      import("@/lib/computer-approval-tools").ComputerApprovalTools &
      import("@/lib/secret-tools").SecretTools
  >
>
