"use client"

import { CodeBlock } from "@/components/ai-elements/code-block"
import { MessageResponse } from "@/components/ai-elements/message"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Image } from "@/components/ai-elements/image"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import type { ChatUIMessage } from "@/lib/sandbox-tools"
import {
  ArrowDownUpIcon,
  BookmarkPlusIcon,
  BrainIcon,
  FilePenLineIcon,
  FileTextIcon,
  FolderSearchIcon,
  KeyboardIcon,
  MonitorUpIcon,
  MousePointerClickIcon,
  MousePointerIcon,
  MoveIcon,
  ScanEyeIcon,
  SquareTerminalIcon,
  TextCursorInputIcon,
  UsersRoundIcon,
  type LucideIcon,
  SettingsIcon,
  CircleHelpIcon,
  SearchIcon,
  GlobeIcon,
} from "lucide-react"

type ToolPart = Extract<
  ChatUIMessage["parts"][number],
  { type: `tool-${string}` }
>

// Ready, running, and finished labels describe the action without implying
// success before a tool has actually returned its result.
const toolTitles: Record<ToolPart["type"], [string, string, string]> = {
  "tool-searchWeb": ["Search web", "Searching web", "Searched web"],
  "tool-readWebPage": ["Read webpage", "Reading webpage", "Read webpage"],
  "tool-askUser": ["Question", "Question", "Answered question"],
  "tool-configureBot": [
    "Configure bot",
    "Saving configuration",
    "Configured bot",
  ],
  "tool-bash": ["Run command", "Running command", "Ran command"],
  "tool-readFile": ["Read file", "Reading file", "Read file"],
  "tool-writeFile": ["Save file", "Saving file", "Saved file"],
  "tool-listFiles": ["List files", "Listing files", "Listed files"],
  "tool-recall": ["Read memory", "Reading memory", "Read memory"],
  "tool-remember": ["Save memory", "Saving memory", "Saved memory"],
  "tool-mouseClick": ["Click mouse", "Clicking mouse", "Clicked mouse"],
  "tool-mouseMove": ["Move mouse", "Moving mouse", "Moved mouse"],
  "tool-mouseDrag": ["Drag mouse", "Dragging mouse", "Dragged mouse"],
  "tool-mouseScroll": ["Scroll page", "Scrolling page", "Scrolled page"],
  "tool-keyboardType": ["Type text", "Typing text", "Typed text"],
  "tool-keyboardPress": ["Press key", "Pressing key", "Pressed key"],
  "tool-viewScreen": ["Check screen", "Checking screen", "Checked screen"],
  "tool-showScreen": ["Share screen", "Sharing screen", "Shared screen"],
  "tool-handoff": ["Ask teammate", "Asking teammate", "Asked teammate"],
  "tool-listTeammates": [
    "Find teammate",
    "Finding teammates",
    "Found teammates",
  ],
  "tool-createTeammate": [
    "Create specialist",
    "Creating specialist",
    "Created specialist",
  ],
  "tool-createGroupChat": [
    "Create group chat",
    "Creating group chat",
    "Created group chat",
  ],
  "tool-consultTeammate": [
    "Consult teammate",
    "Consulting teammate",
    "Teammate contributed",
  ],
  "tool-delegateToTeammate": [
    "Hand over task",
    "Handing over task",
    "Handed over task",
  ],
  "tool-searchAppTools": [
    "Find app tools",
    "Finding app tools",
    "Found app tools",
  ],
  "tool-getAppToolSchema": [
    "Read app tool schema",
    "Reading app tool schema",
    "Read app tool schema",
  ],
  "tool-executeAppTool": [
    "Use connected app",
    "Using connected app",
    "App tool finished",
  ],
}

const toolIcons: Record<ToolPart["type"], LucideIcon> = {
  "tool-searchWeb": SearchIcon,
  "tool-readWebPage": GlobeIcon,
  "tool-askUser": CircleHelpIcon,
  "tool-configureBot": SettingsIcon,
  "tool-bash": SquareTerminalIcon,
  "tool-readFile": FileTextIcon,
  "tool-writeFile": FilePenLineIcon,
  "tool-listFiles": FolderSearchIcon,
  "tool-recall": BrainIcon,
  "tool-remember": BookmarkPlusIcon,
  "tool-mouseClick": MousePointerClickIcon,
  "tool-mouseMove": MousePointerIcon,
  "tool-mouseDrag": MoveIcon,
  "tool-mouseScroll": ArrowDownUpIcon,
  "tool-keyboardType": TextCursorInputIcon,
  "tool-keyboardPress": KeyboardIcon,
  "tool-viewScreen": ScanEyeIcon,
  "tool-showScreen": MonitorUpIcon,
  "tool-handoff": UsersRoundIcon,
  "tool-listTeammates": UsersRoundIcon,
  "tool-createTeammate": UsersRoundIcon,
  "tool-createGroupChat": UsersRoundIcon,
  "tool-delegateToTeammate": UsersRoundIcon,
  "tool-consultTeammate": UsersRoundIcon,
  "tool-searchAppTools": FolderSearchIcon,
  "tool-getAppToolSchema": FileTextIcon,
  "tool-executeAppTool": ArrowDownUpIcon,
}

// Keep previews short even for pasted text. The complete value stays in details.
function preview(text?: string) {
  return text?.replace(/\s+/g, " ").trim().slice(0, 180)
}

function appToolError(part: ToolPart): string | undefined {
  if (
    (part.type === "tool-searchWeb" || part.type === "tool-readWebPage") &&
    part.state === "output-available"
  )
    return part.output.status === "failed" ? part.output.message : undefined
  if (
    (part.type !== "tool-executeAppTool" &&
      part.type !== "tool-getAppToolSchema" &&
      part.type !== "tool-searchAppTools") ||
    part.state !== "output-available"
  )
    return undefined
  try {
    const result = JSON.parse(part.output)
    if (["failed", "unknown", "requires_input"].includes(result.status))
      return [
        result.message,
        result.error,
        result.logId && `Log: ${result.logId}`,
        result.requestId && `Request: ${result.requestId}`,
      ]
        .filter((value) => typeof value === "string")
        .join("\n")
  } catch {
    // Historical results may be plain text.
  }
}

function toolSummary(part: ToolPart): string | undefined {
  const appError = appToolError(part)
  if (appError) return preview(appError)
  if (part.state === "output-error") return preview(part.errorText)
  if (part.state === "output-denied") return "Execution was not approved"

  switch (part.type) {
    case "tool-searchWeb":
      return preview(part.input?.query)
    case "tool-readWebPage":
      return preview(part.input?.url)
    case "tool-bash":
      return preview(part.input?.command)
    case "tool-readFile":
    case "tool-writeFile":
    case "tool-listFiles":
      return preview(part.input?.path)
    case "tool-remember":
      return preview(part.input?.note)
    case "tool-recall":
      return part.state === "output-available"
        ? part.output.memory.trim()
          ? "Memory loaded"
          : "No saved memories"
        : "Saved memories"
    case "tool-keyboardType":
      return preview(part.input?.text)
    case "tool-keyboardPress":
      return [...(part.input?.modifiers ?? []), part.input?.key]
        .filter(Boolean)
        .join(" + ")
    case "tool-mouseClick":
    case "tool-mouseMove":
    case "tool-mouseScroll": {
      const input = part.input
      if (input?.x === undefined || input.y === undefined) return undefined
      const position = `${input.x}, ${input.y}`
      return part.type === "tool-mouseScroll"
        ? `${part.input?.direction ?? ""} · ${position}`
        : position
    }
    case "tool-mouseDrag": {
      const input = part.input
      if (
        input?.startX === undefined ||
        input.startY === undefined ||
        input.endX === undefined ||
        input.endY === undefined
      )
        return undefined
      return `${input.startX}, ${input.startY} → ${input.endX}, ${input.endY}`
    }
    case "tool-viewScreen":
    case "tool-showScreen":
      return part.state === "output-available"
        ? `${part.output.width} × ${part.output.height}`
        : undefined
    case "tool-handoff":
      return preview(part.input?.note)
    case "tool-createTeammate":
    case "tool-createGroupChat":
      return preview(part.input?.name)
    case "tool-consultTeammate":
      return part.state === "output-available"
        ? `${part.output.name} contributed`
        : preview(part.input?.prompt)
    case "tool-delegateToTeammate":
      return preview(part.input?.prompt)
    case "tool-searchAppTools":
      return preview(part.input?.query)
    case "tool-executeAppTool":
    case "tool-getAppToolSchema":
      return preview(part.input?.slug)
  }
}

export function ToolCall({ part }: { part: ToolPart }) {
  if (
    part.type === "tool-consultTeammate" &&
    part.state === "output-available"
  ) {
    return (
      <div data-slot="teammate-contribution" className="min-w-0 space-y-1">
        <p className="px-3 text-xs font-medium break-words text-muted-foreground">
          {part.output.name}
        </p>
        <MessageResponse className="rounded-xl bg-muted/30 px-3 py-2">
          {part.output.answer}
        </MessageResponse>
      </div>
    )
  }
  if (
    (part.type === "tool-createTeammate" ||
      part.type === "tool-createGroupChat" ||
      part.type === "tool-delegateToTeammate") &&
    part.state === "output-available"
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="text-sm text-muted-foreground">
          Task handed over to {part.output.name}.
        </span>
        <Button
          variant="outline"
          size="sm"
          render={
            <Link href={`/chats/${encodeURIComponent(part.output.chatId)}`} />
          }
        >
          Open chat
        </Button>
      </div>
    )
  }
  // The one tool whose result is for the reader: show it, not the call
  if (part.type === "tool-showScreen" && part.state === "output-available") {
    return (
      <Image
        alt="The sandbox's screen"
        base64={part.output.base64}
        className="border"
        mediaType={part.output.mediaType}
      />
    )
  }

  // The teammate's reply follows right below, so one line is enough
  if (part.type === "tool-handoff" && part.state === "output-available") {
    return (
      <p className="text-xs text-muted-foreground">
        <UsersRoundIcon
          aria-hidden="true"
          className="mr-1.5 inline-block size-3.5 align-text-bottom"
        />
        Handed off to {part.output.name}
      </p>
    )
  }

  const state =
    appToolError(part) ||
    (part.type === "tool-bash" &&
      part.state === "output-available" &&
      part.output.exitCode !== 0)
      ? "output-error"
      : part.state
  const titles = toolTitles[part.type]
  const Icon = toolIcons[part.type]
  const title =
    titles[
      state === "output-available" ? 2 : state === "input-available" ? 1 : 0
    ]

  return (
    <Tool>
      <ToolHeader
        icon={<Icon />}
        state={state}
        summary={toolSummary(part)}
        title={title}
        type={part.type}
      />
      <ToolContent>
        <ToolCallDetails part={part} />
      </ToolContent>
    </Tool>
  )
}

function ToolCallDetails({ part }: { part: ToolPart }) {
  const error =
    appToolError(part) ??
    (part.state === "output-error"
      ? part.errorText
      : part.type === "tool-bash" &&
          part.state === "output-available" &&
          part.output.exitCode !== 0
        ? `Command exited with code ${part.output.exitCode}`
        : undefined)

  // Screenshots are for the bot's eyes and stay out of the chat
  if (part.type === "tool-viewScreen" || part.type === "tool-showScreen") {
    return (
      <ToolOutput
        errorText={error}
        output={
          part.state === "output-available" ? (
            <p className="p-2.5 text-muted-foreground">
              {part.type === "tool-viewScreen"
                ? "The bot captured the desktop to see what is on screen."
                : "The bot captured a desktop screenshot to share with you."}
            </p>
          ) : error ? undefined : (
            textResult(
              part.state === "output-denied"
                ? "Screen capture was not approved."
                : part.state === "approval-requested"
                  ? "Waiting for approval to capture the desktop."
                  : "Preparing a desktop screenshot…"
            )
          )
        }
      />
    )
  }

  if (part.type === "tool-bash") {
    return (
      <>
        <ToolInput input={part.input} />
        <ToolOutput
          label="Command output"
          errorText={error}
          output={
            part.state === "output-available" ? (
              <CodeBlock
                code={part.output.output || `Exit code ${part.output.exitCode}`}
                language="log"
              />
            ) : undefined
          }
        />
      </>
    )
  }

  return (
    <>
      {part.input === undefined ? null : <ToolInput input={part.input} />}
      <ToolOutput
        label={resultLabels[part.type]}
        errorText={error}
        output={toolResult(part)}
      />
    </>
  )
}

const resultLabels: Partial<Record<ToolPart["type"], string>> = {
  "tool-searchWeb": "Sources found",
  "tool-readWebPage": "Page content",
  "tool-remember": "Saved note",
  "tool-recall": "Saved memories",
  "tool-readFile": "File content",
  "tool-writeFile": "Saved file",
  "tool-listFiles": "Files found",
}

function textResult(text: string) {
  return <p className="p-2.5 break-words whitespace-pre-wrap">{text}</p>
}

function toolResult(part: ToolPart) {
  if (part.state !== "output-available") return undefined

  // Text results should be readable, rather than one escaped JSON string.
  switch (part.type) {
    case "tool-searchWeb":
      if (part.output.status === "failed") return undefined
      return part.output.results.length ? (
        <ul className="space-y-3 p-2.5">
          {part.output.results.map((result, index) => (
            <li key={`${result.url}:${index}`} className="space-y-1">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium break-words underline underline-offset-4"
              >
                {result.title || result.url}
              </a>
              {result.publishedDate && (
                <p className="text-xs text-muted-foreground">
                  {result.publishedDate}
                </p>
              )}
              <p className="break-words whitespace-pre-wrap">
                {result.content}
              </p>
              {result.truncated && (
                <p className="text-xs text-muted-foreground">
                  Excerpt shortened.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        textResult("No matching sources found.")
      )
    case "tool-readWebPage":
      if (part.output.status === "failed") return undefined
      return (
        <div className="space-y-2 p-2.5">
          <a
            href={part.output.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-4"
          >
            {part.output.url}
          </a>
          {part.output.excerptsOnly && (
            <p className="text-xs text-muted-foreground">
              Relevant excerpts from this page.
            </p>
          )}
          <p className="break-words whitespace-pre-wrap">
            {part.output.content}
          </p>
          {part.output.truncated && (
            <p className="text-xs text-muted-foreground">
              Page content shortened.
            </p>
          )}
        </div>
      )
    case "tool-readFile":
      return part.output.content
    case "tool-recall":
      return textResult(part.output.memory || "No saved memories yet.")
    case "tool-remember":
      return textResult(part.output.remembered)
    case "tool-writeFile":
      return textResult(
        `Saved ${part.output.bytes} bytes to ${part.output.path}.`
      )
    case "tool-listFiles":
      return part.output.files.length ? (
        <ul className="space-y-1 p-2.5">
          {part.output.files.map((file) => (
            <li key={file.name} className="flex items-start gap-2">
              <span className="min-w-0 flex-1 break-all">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {file.isDir ? "Folder" : `${file.size} B`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        textResult("This folder is empty.")
      )
    case "tool-keyboardType":
      return textResult(`Typed ${part.output.typed} characters.`)
    case "tool-keyboardPress":
      return textResult(
        `Pressed ${[...part.output.modifiers, part.output.key].join(" + ")}.`
      )
    case "tool-mouseClick":
      return textResult(`Clicked at ${part.output.x}, ${part.output.y}.`)
    case "tool-mouseMove":
      return textResult(
        `Moved the pointer to ${part.output.x}, ${part.output.y}.`
      )
    case "tool-mouseDrag":
      return textResult(`Dragged to ${part.output.x}, ${part.output.y}.`)
    case "tool-mouseScroll":
      return textResult(
        `Scrolled ${part.output.direction} ${part.output.amount} steps at ${part.output.x}, ${part.output.y}.`
      )
    default:
      return part.output
  }
}
