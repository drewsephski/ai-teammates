"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BrainIcon,
  FileTextIcon,
  MonitorIcon,
  PanelLeftIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { KraftyWordmark } from "@/components/krafty-wordmark"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input"
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool"
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import { DemoComputer, type DemoView } from "./demo-computer"
import { DemoResult } from "./demo-result"
import { demoScenarios } from "./demo-scenarios"
import styles from "./demo.module.css"

export function WorkspacePreview({ signedIn }: { signedIn: boolean }) {
  const [selected, setSelected] = useState(0)
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [view, setView] = useState<DemoView>("document")
  const [desktopOpen, setDesktopOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const example = demoScenarios[selected]
  const complete = step === 4
  const destination = `/workspace?role=${example.id}`
  const href = signedIn
    ? destination
    : `/sign-in?redirect_url=${encodeURIComponent(destination)}`

  useEffect(() => {
    if (!running || step === 4) return
    const timer = window.setTimeout(() => {
      setStep((current) => current + 1)
      if (step === 3) setRunning(false)
    }, 1300)
    return () => window.clearTimeout(timer)
  }, [running, step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function reset() {
    setStep(0)
    setRunning(false)
  }
  function selectExample(index: number) {
    setSelected(index)
    setSidebarOpen(false)
    reset()
    setView("document")
  }
  function run() {
    if (step === 0 || complete) setStep(1)
    setRunning(true)
  }

  const sidebarContent = (
    <>
      {" "}
      <div className="flex items-center justify-between px-2 pb-2">
        <KraftyWordmark />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Create a real teammate"
          nativeButton={false}
          render={<Link href={href} />}
        >
          <PlusIcon />
        </Button>
      </div>
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => setSearchOpen(true)}
      >
        <SearchIcon data-icon="inline-start" />
        Search<Kbd className="ml-auto">⌘K</Kbd>
      </Button>
      <div className="mt-4 flex flex-col gap-1">
        {demoScenarios.map((item, index) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            className={styles.chatLink}
            aria-pressed={selected === index}
            onClick={() => selectExample(index)}
          >
            <ChatAvatar seed={`krafty-${item.name.toLowerCase()}`} />
            <span className="min-w-0 flex-1 text-left">
              <strong className="block truncate text-sm font-medium">
                {item.name}
              </strong>
              <span className="block truncate text-xs text-muted-foreground">
                {item.prompt}
              </span>
            </span>
          </Button>
        ))}
      </div>
      <div className={styles.teamContext}>
        <BrainIcon size={16} />
        <strong>Example workspace</strong>
        <p>Choose a conversation to try a different task.</p>
      </div>
    </>
  )

  return (
    <div className={styles.demoWrap}>
      <div className={styles.demoTopline}>
        <span>
          <span className={styles.statusDot} /> Take Krafty for a spin
        </span>
        <span>Interactive example · no live agent running</span>
      </div>
      <div className={styles.demo} data-desktop={desktopOpen}>
        <aside className={styles.team} aria-label="Example workspace sidebar">
          {sidebarContent}
        </aside>
        <div className={styles.conversation}>
          <header
            data-slot="chat-header"
            className="flex h-12 shrink-0 items-center gap-2 border-b px-4"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={styles.mobileSidebarTrigger}
              aria-label="Choose example teammate"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeftIcon />
            </Button>
            <ChatAvatar
              seed={`krafty-${example.name.toLowerCase()}`}
              className="size-6"
            />
            <span className="truncate text-sm font-medium">{example.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label="Desktop"
              aria-pressed={desktopOpen}
              onClick={() => setDesktopOpen((open) => !open)}
            >
              <MonitorIcon />
            </Button>
          </header>
          <Conversation key={`${example.id}-${step === 0}`}>
            <ConversationContent className="mx-auto w-full max-w-3xl">
              {step === 0 ? (
                <ConversationEmptyState
                  icon={
                    <ChatAvatar
                      seed={`krafty-${example.name.toLowerCase()}`}
                      className="size-10"
                    />
                  }
                  title={`Meet ${example.name}`}
                  description="Send the example task below to see how a conversation works."
                />
              ) : (
                <>
                  <Message from="user">
                    <MessageContent>
                      <MessageResponse>{example.prompt}</MessageResponse>
                    </MessageContent>
                  </Message>
                  <Message from="assistant">
                    <MessageContent className="w-full gap-1">
                      <MessageResponse>{example.response}</MessageResponse>
                      <div className="mt-3 flex flex-col gap-1">
                        {example.steps.map(
                          (label, index) =>
                            step >= index + 1 && (
                              <Tool key={label}>
                                <ToolHeader
                                  type={
                                    index === 2
                                      ? "tool-writeFile"
                                      : "tool-readFile"
                                  }
                                  title={label}
                                  summary={example.terminal[index].replace(
                                    /^(read|write) /,
                                    ""
                                  )}
                                  icon={<FileTextIcon />}
                                  state={
                                    step > index + 1
                                      ? "output-available"
                                      : running
                                        ? "input-available"
                                        : "input-streaming"
                                  }
                                />
                                <ToolContent>
                                  <p className="p-3 text-xs text-muted-foreground">
                                    {step > index + 1
                                      ? "This example step is complete."
                                      : "This illustrative step is in progress."}{" "}
                                    No live tool is running.
                                  </p>
                                </ToolContent>
                              </Tool>
                            )
                        )}
                      </div>
                      {complete && (
                        <>
                          <MessageResponse className="mt-3">
                            The example result is ready. Open it to review the
                            details.
                          </MessageResponse>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3 w-fit"
                            onClick={() => setResultOpen(true)}
                          >
                            <FileTextIcon data-icon="inline-start" />
                            Open example result
                            <AnimatedArrow direction="diagonal" size={14} />
                          </Button>
                        </>
                      )}
                    </MessageContent>
                  </Message>
                </>
              )}
            </ConversationContent>
          </Conversation>
          <div className="mx-auto w-full max-w-3xl p-4 pt-0">
            <PromptInput key={example.id} onSubmit={run}>
              <PromptInputTextarea
                readOnly
                value={step === 0 ? example.prompt : ""}
                placeholder="Send a message..."
                aria-label="Example task (choose a teammate to change it)"
              />
              <PromptInputFooter className="justify-between">
                <span className="text-xs text-muted-foreground">
                  {running ? "Running example…" : "Interactive demo"}
                </span>
                <PromptInputSubmit
                  status={running ? "streaming" : "ready"}
                  onStop={() => setRunning(false)}
                  aria-label={
                    running
                      ? "Pause demo"
                      : step > 0 && !complete
                        ? "Continue demo"
                        : "Run demo"
                  }
                >
                  {running ? undefined : (
                    <AnimatedArrow direction="up" size={16} />
                  )}
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
        {desktopOpen && (
          <DemoComputer
            example={example}
            step={step}
            running={running}
            view={view}
            onViewChange={setView}
            onPause={() => setRunning(false)}
            onReset={reset}
            onExpand={() => setResultOpen(true)}
          />
        )}
      </div>
      <div className={styles.demoFooter}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={step === 0 || complete}
            onClick={() => {
              setRunning(false)
              setStep((current) => Math.min(4, current + 1))
            }}
          >
            Next step
            <AnimatedArrow size={13} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={reset}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Reset demo
          </Button>
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground"
          >
            {complete
              ? "Example finished. Ready to review."
              : running
                ? `${example.steps[step - 1]}…`
                : step > 0
                  ? "Example paused."
                  : "Try an example task."}
          </span>
        </div>
        <Link href={href} prefetch={false}>
          Try {example.label.toLowerCase()} in Krafty
          <AnimatedArrow size={14} />
        </Link>
      </div>
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle>Example workspace</SheetTitle>
            <SheetDescription>
              Choose a teammate to try a different task.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            {sidebarContent}
          </div>
        </SheetContent>
      </Sheet>
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search example chats"
        description="Choose an illustrative conversation."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No example chats found.</CommandEmpty>
            <CommandGroup heading="Example chats">
              {demoScenarios.map((item, index) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.role}`}
                  onSelect={() => {
                    selectExample(index)
                    setSearchOpen(false)
                  }}
                >
                  <ChatAvatar seed={`krafty-${item.name.toLowerCase()}`} />
                  <span>{item.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {item.role}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{example.file}</DialogTitle>
            <DialogDescription>
              Illustrative sample. No live tools or files are created by this
              demo.
            </DialogDescription>
          </DialogHeader>
          <DemoResult example={example} />
          <DialogFooter>
            <Button
              nativeButton={false}
              render={<Link href={href} />}
              onClick={() => setResultOpen(false)}
            >
              Start with a real teammate
              <AnimatedArrow size={14} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
