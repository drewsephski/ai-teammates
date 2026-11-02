import { setTimeout as sleep } from "node:timers/promises"

import type { Sandbox } from "@e2b/desktop"
import { tool, type InferUITools, type UIMessage } from "ai"
import { z } from "zod"

import { computerShell, withComputer, runSandboxCommand } from "@/lib/e2b"
import { isComputerBusy, type ComputerBusy } from "@/lib/computer-lease-policy"
import { shellPath } from "@/lib/computer-shell"
import {
  buildScreenSnapshot,
  isBlankScreenshot,
  openUrlSchema,
  SCREEN_NO_WINDOW,
  SCREEN_UNREADABLE,
  visibleCenter,
  type ScreenElement,
  type ScreenRead,
  type ScreenSnapshot,
} from "@/lib/screen-reader"
import {
  openBrowserPage,
  PAGE_WAIT_MS,
  readScreenPatiently,
  type PageExec,
} from "@/lib/browser-page"
import {
  gestureNeedsCheck,
  protectedPath,
  shellCommandRisk,
  type ComputerGesture,
} from "@/lib/computer-approval-policy"
import type { ComputerGate } from "@/lib/computer-approval-tools"
import { redactSecrets } from "@/lib/secret-policy"
import type { HandoffTools } from "@/lib/handoff-tool"

// Enough for a model to work with, without one noisy command filling its context
const MAX_TEXT_LENGTH = 20_000

// The browser's profile and the places that run things later stay off limits
// to the file tools, as they are to the shell
function allowedPath(path: string, home: string) {
  const resolved = shellPath(path, home)
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

// A control from the latest readScreen
const ref = z
  .string()
  .regex(/^e\d{1,4}$/, "Use a ref from readScreen, such as e4.")
  .describe("The element's ref from your latest readScreen, such as e4")

async function clickAt(
  sandbox: Sandbox,
  {
    x,
    y,
    button,
    double,
  }: { x: number; y: number; button: string; double: boolean }
) {
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
}

// A desktop that just resumed can be black for a few seconds while it
// repaints, so a blank screenshot is taken again before it's believed
const BLANK_RETRIES = 3
const BLANK_RETRY_MS = 2000

export async function takeScreenshot(sandbox: Sandbox) {
  const screen = await sandbox.getScreenSize()
  for (let attempt = 0; ; attempt++) {
    const shot = await sandbox.screenshot()
    if (!shot.byteLength) throw new Error("The screenshot came back empty")
    const blank = isBlankScreenshot(shot.byteLength, screen)
    if (!blank || attempt >= BLANK_RETRIES)
      return {
        base64: Buffer.from(shot).toString("base64"),
        mediaType: "image/png",
        width: screen.width,
        height: screen.height,
        blank,
      }
    await sleep(BLANK_RETRY_MS)
  }
}

export const BLANK_SCREEN_NOTE =
  "The screen is blank (one flat colour): the desktop is still starting or the browser is unresponsive. Call openOnScreen for the page you need; it waits for the page and restarts the browser if it's stuck. Don't take screenshots in a loop."

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
        text: `Screenshot of the ${output.width}x${output.height} screen. Coordinates are in pixels from the top left.${output.blank ? ` ${BLANK_SCREEN_NOTE}` : ""}`,
      },
      {
        type: "file" as const,
        mediaType: output.mediaType,
        data: { type: "data" as const, data: output.base64 },
      },
    ],
  }
}

// Runs the browser and the screen reader on the computer as the desktop's
// user, the way the page module expects
function pageExec(sandbox: Sandbox): PageExec {
  return async (command, options = {}) => {
    if (options.background) {
      const handle = await sandbox.commands.run(command, {
        background: true,
        envs: options.envs,
      })
      await handle.disconnect()
      return { stdout: "", exitCode: 0 }
    }
    const result = await runSandboxCommand(
      sandbox,
      command,
      undefined,
      options.timeoutMs ?? 20_000,
      undefined,
      options.envs
    )
    return { stdout: result.stdout, exitCode: result.exitCode }
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

  // The latest readScreen in this turn: refs point into it
  let reading: ScreenSnapshot | undefined
  function element(id: string): ScreenElement & { x: number; y: number } {
    const found = reading?.refs.get(id)
    if (!reading || !found)
      throw new Error(
        `There's no ${id} in your latest readScreen. Call readScreen again and use a ref from it.`
      )
    const center = visibleCenter(found, reading.screen)
    if (!center)
      throw new Error(
        `${id} isn't on the screen. Scroll to it, then call readScreen again.`
      )
    return { ...found, ...center }
  }

  // Turns a walker result into what the model reads, and keeps the refs
  async function finishReading(
    read: ScreenRead | undefined,
    screen: { width: number; height: number }
  ) {
    if (!read || "error" in read) {
      reading = undefined
      return {
        status: "unreadable" as const,
        message:
          read?.error === "no-window" ? SCREEN_NO_WINDOW : SCREEN_UNREADABLE,
      }
    }
    const snapshot = buildScreenSnapshot(read, screen)
    // Nothing to act on: a window without an accessibility tree
    if (!snapshot.count && !read.elements.length) {
      reading = undefined
      return {
        status: "unreadable" as const,
        message: read.busy
          ? `${SCREEN_UNREADABLE} The page is still loading: call readScreen again in a moment.`
          : SCREEN_UNREADABLE,
      }
    }
    reading = snapshot
    options.onScreenViewed?.()
    return {
      status: "read" as const,
      app: read.app,
      window: read.window,
      url: read.url,
      elements: snapshot.count,
      text: modelText(snapshot.text, await secretEnv()),
    }
  }

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
              const shell = await computerShell(sandbox)
              const envs = await secretEnv()
              // Stop kills the command: the computer is shared with other bots
              const response = await runSandboxCommand(
                sandbox,
                command,
                cwd ? allowedPath(cwd, shell.home) : shell.home,
                timeout * 1000,
                abortSignal,
                Object.keys(envs).length ? envs : undefined,
                shell.user
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
          const { home, user } = await computerShell(sandbox)
          const file = await sandbox.files.read(allowedPath(path, home), {
            user,
          })
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
          const { home, user } = await computerShell(sandbox)
          const file = Buffer.from(content, "utf8")
          await sandbox.files.write(allowedPath(path, home), content, { user })
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
          const { home, user } = await computerShell(sandbox)
          const files = await sandbox.files.list(allowedPath(path, home), {
            user,
          })
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
              await clickAt(sandbox, { x, y, button, double })
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

    readScreen: tool({
      description:
        "Read the focused window on the computer's desktop as text: its controls, links, fields and text, with a ref such as e4 on each control you can pass to clickElement or fillElement. It is cheaper and more precise than viewScreen for finding what to click or type into, so try it first; use viewScreen when you need to see images, layout or anything it leaves out, or when it says the window can't be read. Refs belong to the latest reading only.",
      inputSchema: z.object({}),
      execute: async () =>
        runInSandbox(
          async (sandbox) => {
            const screen = await sandbox.getScreenSize()
            // A page that just opened gets a moment to finish loading
            const read = await readScreenPatiently({
              exec: pageExec(sandbox),
              screen,
            })
            return finishReading(read, screen)
          },
          undefined,
          30_000
        ),
    }),

    clickElement: tool({
      description:
        "Click a control from your latest readScreen by its ref, such as e4. Krafty checks the click like any other before it runs. Call readScreen again after the screen changes, because refs from an older reading may point at something else.",
      inputSchema: z.object({
        ref,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false).describe("Double-click"),
        approvalId,
      }),
      execute: async ({ ref: id, button, double, approvalId }, context) => {
        const target = element(id)
        const { x, y } = target
        return runInSandbox((sandbox) =>
          guarded(
            sandbox,
            { tool: "mouseClick", x, y, button, double },
            approvalId,
            context,
            async () => {
              await clickAt(sandbox, { x, y, button, double })
              return { ref: id, role: target.role, name: target.name, x, y }
            }
          )
        )
      },
    }),

    fillElement: tool({
      description:
        "Replace the text in a field from your latest readScreen by its ref, such as e4: it clicks the field, selects what's in it and types the new text. An empty text clears the field. Newlines are typed as Enter, which may submit the form.",
      inputSchema: z.object({
        ref,
        text: z.string().max(10_000).describe("The field's new text"),
        approvalId,
      }),
      execute: async ({ ref: id, text, approvalId }, context) => {
        const target = element(id)
        const { x, y } = target
        return runInSandbox(async (sandbox) => {
          await guarded(
            sandbox,
            { tool: "mouseClick", x, y, button: "left", double: false },
            approvalId,
            context,
            () => sandbox.leftClick(x, y)
          )
          // Select-all and Backspace only edit the field
          await guarded(
            sandbox,
            { tool: "keyboardPress", key: "a", modifiers: ["ctrl"] },
            undefined,
            context,
            () => sandbox.press(["ctrl", "a"])
          )
          if (!text)
            await guarded(
              sandbox,
              { tool: "keyboardPress", key: "backspace", modifiers: [] },
              undefined,
              context,
              () => sandbox.press("backspace")
            )
          else
            await guarded(
              sandbox,
              { tool: "keyboardType", text },
              approvalId,
              // Its own check, metered apart from the click's
              { ...context, toolCallId: `${context.toolCallId}:type` },
              () => sandbox.write(text)
            )
          return {
            ref: id,
            role: target.role,
            name: target.name,
            typed: text.length,
          }
        })
      },
    }),

    openOnScreen: tool({
      description:
        "Open a web page in the browser on the computer's desktop, in a new tab when the browser is already open, and wait for it to load. Use this to go to a website instead of opening it from bash, and instead of sleeping or taking screenshots while a page loads. It returns the loaded page read as text, like readScreen, with refs you can pass to clickElement or fillElement right away. If the browser is unresponsive it restarts it.",
      inputSchema: z.object({
        url: openUrlSchema.describe(
          "The full http or https address, such as https://www.espn.com/fantasy/football/"
        ),
      }),
      execute: async ({ url }) =>
        runInSandbox(
          async (sandbox) => {
            const screen = await sandbox.getScreenSize()
            const opened = await openBrowserPage(
              { exec: pageExec(sandbox), screen },
              url
            )
            const page = opened.read
              ? await finishReading(opened.read, screen)
              : undefined
            if (page?.status === "read" && opened.status !== "opening")
              return {
                url,
                status: opened.status,
                restarted: opened.restarted,
                app: page.app,
                window: page.window,
                pageUrl: page.url,
                elements: page.elements,
                text: page.text,
              }
            return {
              url,
              status: "opening" as const,
              restarted: opened.restarted,
              message: `The browser hasn't shown ${url} yet${opened.restarted ? ", even after restarting it" : ""}. Wait a few seconds, then call readScreen; if there's still no page, call viewScreen to see what the desktop shows.`,
            }
          },
          undefined,
          // Two waits, in case the browser is restarted, plus the reading
          2 * PAGE_WAIT_MS + 30_000
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
      import("@/lib/social-tools").SocialTools &
      import("@/lib/routine-tools").RoutineTools &
      import("@/lib/computer-approval-tools").ComputerApprovalTools &
      import("@/lib/secret-tools").SecretTools &
      import("@/lib/fantasy-football-tools").FantasyFootballTools
  >
>
