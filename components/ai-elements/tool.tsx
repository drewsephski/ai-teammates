"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DynamicToolUIPart, ToolUIPart } from "ai"
import {
  CheckCircleIcon,
  CircleIcon,
  ClockIcon,
  LoaderCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { isValidElement } from "react"

import { AnimatedArrow } from "@/components/ui/animated-arrow"

import { CodeBlock } from "./code-block"

export type ToolProps = ComponentProps<typeof Collapsible>

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    defaultOpen={false}
    className={cn(
      "group/tool not-prose w-full min-w-0 rounded-md border border-transparent data-open:border-border/60",
      className
    )}
    {...props}
  />
)

export type ToolPart = ToolUIPart | DynamicToolUIPart

export type ToolHeaderProps = {
  title?: string
  summary?: string
  icon?: ReactNode
  className?: string
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"]
      state: DynamicToolUIPart["state"]
      toolName: string
    }
)

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Needs approval",
  "approval-responded": "Reviewed",
  "input-available": "Running",
  "input-streaming": "Preparing",
  "output-available": "Done",
  "output-denied": "Not approved",
  "output-error": "Failed",
}

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3.5" />,
  "approval-responded": <CheckCircleIcon className="size-3.5" />,
  "input-available": (
    <LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" />
  ),
  "input-streaming": <CircleIcon className="size-3.5" />,
  "output-available": (
    <CheckCircleIcon className="size-3 text-muted-foreground" />
  ),
  "output-denied": <XCircleIcon className="size-3.5" />,
  "output-error": <XCircleIcon className="size-3.5" />,
}

export const getStatusBadge = (status: ToolPart["state"]) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground",
      (status === "output-error" || status === "output-denied") &&
        "text-destructive"
    )}
  >
    <span aria-hidden="true">{statusIcons[status]}</span>
    <span
      className={
        status === "output-available"
          ? "sr-only in-data-panel-open:not-sr-only"
          : undefined
      }
    >
      {statusLabels[status]}
    </span>
  </span>
)

export const ToolHeader = ({
  className,
  title,
  summary,
  icon,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-")

  return (
    <CollapsibleTrigger
      className={cn(
        "flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-panel-open:bg-muted/30 motion-safe:transition-colors motion-safe:duration-150 sm:min-h-7 sm:py-0.5",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground [&>svg]:size-3"
      >
        {icon ?? <WrenchIcon />}
      </span>
      <span className="max-w-[45%] truncate text-xs font-normal text-muted-foreground group-hover/tool:text-foreground in-data-panel-open:font-medium in-data-panel-open:text-foreground">
        {title ?? derivedName}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {summary}
      </span>
      {getStatusBadge(state)}
      <span
        aria-hidden="true"
        className="inline-flex size-3 shrink-0 text-muted-foreground/60 in-data-panel-open:rotate-180 motion-safe:transition-[rotate] motion-safe:duration-200 motion-safe:ease-out"
      >
        <AnimatedArrow direction="disclosure" size={12} />
      </span>
    </CollapsibleTrigger>
  )
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>

export const ToolContent = ({
  className,
  children,
  ...props
}: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "tool-details min-w-0 overflow-hidden outline-none",
      className
    )}
    {...props}
  >
    <div className="space-y-2 border-t border-border/60 p-2.5 text-popover-foreground [&_[data-language]]:border-0 [&_[data-language]>div]:max-h-56 [&_code]:text-xs [&_pre]:p-2.5 [&_pre]:text-xs">
      {children}
    </div>
  </CollapsibleContent>
)

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"]
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  if (
    input === undefined ||
    (input !== null &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      Object.keys(input).length === 0)
  )
    return null

  return (
    <div className={cn("min-w-0", className)} {...props}>
      {input !== null && typeof input === "object" && !Array.isArray(input) ? (
        <dl className="grid grid-cols-2 gap-2">
          {Object.entries(input).map(([key, value]) => (
            <div
              key={key}
              className={cn(
                "min-w-0 space-y-1",
                typeof value !== "number" &&
                  typeof value !== "boolean" &&
                  "col-span-2"
              )}
            >
              <dt className="text-xs font-medium text-muted-foreground">
                {inputLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </dt>
              <dd className="rounded-md bg-muted/40">
                {typeof value === "string" &&
                (key === "command" || key === "content") ? (
                  <CodeBlock
                    code={value}
                    language={key === "command" ? "bash" : "log"}
                  />
                ) : (
                  <ScrollArea viewportProps={{ className: "max-h-56" }}>
                    <p className="p-2.5 text-xs break-words whitespace-pre-wrap">
                      {formatInputValue(key, value)}
                    </p>
                  </ScrollArea>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
      )}
    </div>
  )
}

const inputLabels: Record<string, string> = {
  command: "Command",
  cwd: "Working folder",
  timeout: "Time limit",
  path: "Path",
  content: "File content",
  note: "Note",
  text: "Text to type",
  key: "Key",
  modifiers: "Modifier keys",
  button: "Mouse button",
  double: "Double click",
  direction: "Scroll direction",
  amount: "Scroll steps",
  x: "Horizontal position",
  y: "Vertical position",
  startX: "Start X",
  startY: "Start Y",
  endX: "End X",
  endY: "End Y",
  botId: "Teammate",
}

function formatInputValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number" && key === "timeout") return `${value} seconds`
  if (key === "modifiers" && Array.isArray(value))
    return value.length ? value.join(" + ") : "None"
  if (typeof value === "string") return value || "Empty"
  return JSON.stringify(value, null, 2) ?? "Not provided"
}

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"]
  errorText: ToolPart["errorText"]
  label?: string
}

export const ToolOutput = ({
  className,
  output,
  errorText,
  label = "Result",
  ...props
}: ToolOutputProps) => {
  if (output === undefined && !errorText) {
    return null
  }

  let Output: ReactNode = null

  if (output !== undefined && !isValidElement(output)) {
    Output = (
      <CodeBlock
        code={
          typeof output === "string" ? output : JSON.stringify(output, null, 2)
        }
        language={typeof output === "string" ? "log" : "json"}
      />
    )
  } else if (isValidElement(output)) {
    Output = output
  }

  return (
    <div className={cn("min-w-0 space-y-1", className)} {...props}>
      <h4 className="text-xs font-medium text-muted-foreground">
        {errorText ? "What went wrong" : label}
      </h4>
      <div
        className={cn(
          "rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && (
          <ScrollArea viewportProps={{ className: "max-h-56" }}>
            <p className="p-2.5 break-words whitespace-pre-wrap">{errorText}</p>
          </ScrollArea>
        )}
        {isValidElement(Output) && Output.type === CodeBlock ? (
          Output
        ) : (
          <ScrollArea
            orientation="both"
            viewportProps={{ className: "max-h-56" }}
          >
            {Output}
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
