import type { Sandbox } from "@e2b/desktop"
import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai"
import { z } from "zod"

import {
  withBotSandbox,
  MEMORY_FILE,
  readBotMemory,
  runSandboxCommand,
} from "@/lib/e2b"
import { sandboxPath } from "@/lib/sandbox-policy"
import type { HandoffTools } from "@/lib/handoff-tool"

// Enough for a model to work with, without one noisy command filling its context
const MAX_TEXT_LENGTH = 20_000

function truncate(text: string) {
  if (text.length <= MAX_TEXT_LENGTH) return text
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n… truncated ${text.length - MAX_TEXT_LENGTH} more characters`
}

const point = {
  x: z.number().int().describe("Pixels from the left edge of the screen"),
  y: z.number().int().describe("Pixels from the top edge of the screen"),
}

async function takeScreenshot(sandbox: Sandbox) {
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

// A bot's sandbox as a tool set. The sandbox is only looked up, woken and
// renewed when a tool needs it. Ask for the ID on every call so handoffs use
// the receiving bot's computer, and paused sessions never leave stale clients.
export function createSandboxTools(
  getSandboxId: () => string | Promise<string>
) {
  async function runInSandbox<T>(
    operation: (sandbox: Sandbox) => Promise<T>,
    leaseMs?: number
  ) {
    return withBotSandbox(await getSandboxId(), operation, leaseMs)
  }

  return {
    bash: tool({
      description:
        "Run a shell command in your sandbox and get its output and exit code. Commands start in your home directory unless you pass cwd, and each call is a fresh shell.",
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
      }),
      execute: async ({ command, cwd, timeout = 60 }) =>
        runInSandbox(
          async (sandbox) => {
            const response = await runSandboxCommand(
              sandbox,
              command,
              cwd ? sandboxPath(cwd) : undefined,
              timeout * 1000
            )
            return {
              exitCode: response.exitCode,
              output: truncate(response.stdout + response.stderr),
            }
          },
          Math.max(5 * 60_000, (timeout + 30) * 1000)
        ),
    }),

    readFile: tool({
      description: "Read a text file from your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("File path, absolute or relative to your home directory"),
      }),
      execute: async ({ path }) =>
        runInSandbox(async (sandbox) => {
          const file = await sandbox.files.read(sandboxPath(path))
          return { content: truncate(file) }
        }),
    }),

    writeFile: tool({
      description:
        "Write a text file in your sandbox, creating it and any missing folders, or replacing it if it exists.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("File path, absolute or relative to your home directory"),
        content: z.string().describe("The full new content of the file"),
      }),
      execute: async ({ path, content }) =>
        runInSandbox(async (sandbox) => {
          const file = Buffer.from(content, "utf8")
          await sandbox.files.write(sandboxPath(path), content)
          return { path, bytes: file.byteLength }
        }),
    }),

    listFiles: tool({
      description: "List the files and folders in a directory of your sandbox.",
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
          const files = await sandbox.files.list(sandboxPath(path))
          return {
            files: files.map((file) => ({
              name: file.name,
              isDir: file.type === "dir",
              size: file.size,
            })),
          }
        }),
    }),

    recall: tool({
      description:
        "Read your memory: the notes you have saved across all your conversations with the person, including ones you cannot see from here. Call this before answering any question about the person, their preferences, their projects or anything said or decided earlier, and always before saying you do not know something or asking them to tell you again.",
      inputSchema: z.object({}),
      execute: async () =>
        runInSandbox(async (sandbox) => {
          return { memory: truncate(await readBotMemory(sandbox)) }
        }),
    }),

    remember: tool({
      description:
        "Save a note to your memory, so that you know it in every conversation with the person, not only this one. Call this whenever they ask you to remember something, and whenever you learn something worth knowing later: facts about them and their work, their preferences, decisions, standing instructions. Saying you will remember something does nothing unless you call this.",
      inputSchema: z.object({
        note: z
          .string()
          .describe(
            "What to remember, as one self-contained sentence that makes sense without this conversation"
          ),
      }),
      execute: async ({ note }) =>
        runInSandbox(async (sandbox) => {
          const line = Buffer.from(`- ${note.trim()}\n`, "utf8")
          // Encoded so no note can break out of the command, and appended so
          // notes saved from two chats at once both survive
          const response = await runSandboxCommand(
            sandbox,
            `echo ${line.toString("base64")} | base64 -d >> ${MEMORY_FILE}`
          )
          if (response.exitCode !== 0) throw new Error(response.stderr)
          return { remembered: note.trim() }
        }),
    }),

    mouseClick: tool({
      description:
        "Click the mouse at a point on your sandbox's desktop. Look at the screen first to find the coordinates.",
      inputSchema: z.object({
        ...point,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false).describe("Double-click"),
      }),
      execute: async ({ x, y, button, double }) =>
        runInSandbox(async (sandbox) => {
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
        }),
    }),

    mouseMove: tool({
      description:
        "Move the mouse cursor to a point on your sandbox's desktop without clicking.",
      inputSchema: z.object(point),
      execute: async ({ x, y }) =>
        runInSandbox(async (sandbox) => {
          await sandbox.moveMouse(x, y)
          return { x, y }
        }),
    }),

    mouseDrag: tool({
      description:
        "Press the left mouse button at one point on your sandbox's desktop, drag to another and release.",
      inputSchema: z.object({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      }),
      execute: async ({ startX, startY, endX, endY }) =>
        runInSandbox(async (sandbox) => {
          await sandbox.drag([startX, startY], [endX, endY])
          return { x: endX, y: endY }
        }),
    }),

    mouseScroll: tool({
      description:
        "Scroll the mouse wheel at a point on your sandbox's desktop.",
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
        "Type text into whatever has keyboard focus on your sandbox's desktop. Newlines are typed as Enter.",
      inputSchema: z.object({
        text: z.string().describe("The text to type"),
      }),
      execute: async ({ text }) =>
        runInSandbox(async (sandbox) => {
          await sandbox.write(text)
          return { typed: text.length }
        }),
    }),

    keyboardPress: tool({
      description:
        "Press a single key on your sandbox's desktop, optionally with modifiers held, e.g. key 'enter', or key 'c' with modifiers ['ctrl'].",
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "A key name: a letter or digit, enter, escape, tab, backspace, delete, space, up, down, left, right, home, end, pageup, pagedown, f1-f12"
          ),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).default([]),
      }),
      execute: async ({ key, modifiers }) =>
        runInSandbox(async (sandbox) => {
          await sandbox.press([
            ...modifiers.map((modifier) =>
              modifier === "cmd" ? "super" : modifier
            ),
            key,
          ])
          return { key, modifiers }
        }),
    }),

    viewScreen: tool({
      description:
        "Look at your sandbox's desktop yourself. Use this whenever you need to see the screen to do your work, such as before clicking and after an action to check what happened. The person you are talking to does not see this screenshot.",
      inputSchema: z.object({}),
      execute: async () => runInSandbox(takeScreenshot),
      toModelOutput: screenshotToModelOutput,
    }),

    showScreen: tool({
      description:
        "Show your sandbox's desktop to the person you are talking to: the screenshot appears in the chat, and you see it too. Use this only when they ask to see the screen or what is on it.",
      inputSchema: z.object({}),
      execute: async () => runInSandbox(takeScreenshot),
      toModelOutput: screenshotToModelOutput,
    }),
  }
}

export type SandboxTools = ReturnType<typeof createSandboxTools>
// A reply carries the bot that started it and a group chat's message the bot it
// was sent to, so the chat can show who answered whom
export type ChatMessageMetadata = { botId?: string; questionId?: string }
export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  InferUITools<
    SandboxTools &
      HandoffTools &
      import("@/lib/team-tools").TeamTools &
      import("@/lib/bot-setup-tools").BotSetupTools &
      import("@/lib/composio").ConnectorTools
  >
>
