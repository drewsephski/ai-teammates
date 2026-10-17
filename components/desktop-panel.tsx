"use client"

import * as React from "react"
import type RFB from "@novnc/novnc"
import * as Sentry from "@sentry/nextjs"
import Link from "next/link"
import { MonitorIcon, PauseIcon, RefreshCwIcon } from "lucide-react"

import {
  getComputerInUse,
  getComputerTime,
  getDesktopUrl,
  pauseDesktop,
  resetDesktop,
} from "@/actions/chat"
import { hasUsageLeft } from "@/actions/usage"
import {
  desktopCloseKind,
  formatClock,
  showComputerClock,
} from "@/components/computer-status"
import { DesktopResetDialog } from "@/components/desktop-reset-dialog"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useIsMobile } from "@/hooks/use-mobile"
import { computerTimeUsedUpMessage } from "@/lib/sandbox-policy"

type DesktopStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "paused"
  | "pausing"
  | "missing"
  // The computer time is used up
  | "exhausted"
  // The session ended on the server (paused or replaced): reconnect by hand
  | "ended"
  // Computers are busy, or another operation holds this one
  | "unavailable"

// What the last attempt to open the computer said, when it said no
type ResetResult = Awaited<ReturnType<typeof resetDesktop>>

type ComputerTime = {
  tier: "free" | "paid"
  remainingSeconds: number
  // When the server reported it, to count down from
  at: number
}

type DesktopPanelContextValue = {
  open: boolean
  openForLogin: () => Promise<void>
  fullscreen: boolean
  setFullscreen: (open: boolean) => void
  toggle: () => void
  close: () => void
  status: DesktopStatus
  // The server's reason when the computer couldn't be opened
  notice: string | null
  // The account's computer time, from the server
  time: ComputerTime | null
  // The bot currently working on the shared computer, from the last connect
  inUseBy: { botId: string; name: string } | null
  connect: () => void
  pause: () => void
  reset: () => Promise<ResetResult>
  // Moves the one live screen into the given element
  attachScreen: (slot: HTMLElement) => void
  // Whether the screen takes mouse and keyboard input or is only watched
  setInteractive: (interactive: boolean) => void
}

const DesktopPanelContext =
  React.createContext<DesktopPanelContextValue | null>(null)

export function useOptionalDesktopPanel() {
  return React.useContext(DesktopPanelContext)
}

function useDesktopPanel() {
  const context = React.useContext(DesktopPanelContext)
  if (!context) {
    throw new Error(
      "useDesktopPanel must be used within a DesktopPanelProvider."
    )
  }
  return context
}

function DesktopPanelProvider({
  chatId,
  children,
}: {
  chatId: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [status, setStatus] = React.useState<DesktopStatus>("idle")
  const [inUseBy, setInUseBy] = React.useState<{
    botId: string
    name: string
  } | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [time, setTime] = React.useState<ComputerTime | null>(null)

  const refreshTime = React.useCallback(() => {
    getComputerTime().then(
      ({ tier, remainingSeconds }) =>
        setTime({ tier, remainingSeconds, at: Date.now() }),
      () => {}
    )
  }, [])

  // The VNC client draws into this element. It is never rendered by React, so
  // it can be moved between the panel and the dialog without reconnecting.
  const screenRef = React.useRef<HTMLDivElement | null>(null)
  const rfbRef = React.useRef<RFB | null>(null)
  const interactiveRef = React.useRef(false)
  // Only the latest connection attempt may report its status
  const attemptRef = React.useRef(0)
  const toggleRequestRef = React.useRef(0)

  const getScreen = React.useCallback(() => {
    if (!screenRef.current) {
      screenRef.current = document.createElement("div")
      screenRef.current.className = "size-full"
    }
    return screenRef.current
  }, [])

  const connect = React.useCallback(async () => {
    const attempt = ++attemptRef.current
    rfbRef.current?.disconnect()
    rfbRef.current = null
    setStatus("connecting")
    const startedAt = Date.now()

    try {
      const [connection, { default: RFB }] = await Promise.all([
        getDesktopUrl(chatId),
        import("@novnc/novnc"),
      ])
      if (attempt !== attemptRef.current) return
      if (!connection.ok) {
        // Expected outcomes arrive as data: production hides error text
        setInUseBy(null)
        setNotice(connection.message)
        setStatus(connection.reason === "usage" ? "exhausted" : "unavailable")
        if (connection.reason === "usage") refreshTime()
        return
      }
      if (connection.missing) {
        setInUseBy(null)
        setStatus("missing")
        return
      }
      setInUseBy(connection.inUseBy)

      const address = new URL(connection.url, window.location.origin)
      address.protocol = address.protocol === "https:" ? "wss:" : "ws:"
      // Our own socket, so the close code tells a spent allowance from a drop
      const socket = new WebSocket(address.toString())
      let closeCode: number | undefined
      socket.addEventListener("close", (event) => {
        closeCode = event.code
      })
      const rfb = new RFB(getScreen(), socket)
      rfb.scaleViewport = true
      rfb.background = "transparent"
      rfb.viewOnly = !interactiveRef.current
      rfb.addEventListener("connect", () => {
        if (attempt !== attemptRef.current) return
        setNotice(null)
        setStatus("connected")
        refreshTime()
        Sentry.logger.info("Desktop connected", {
          "chat.id": chatId,
          "desktop.connect_ms": Date.now() - startedAt,
        })
        if (interactiveRef.current) rfb.focus()
      })
      rfb.addEventListener("disconnect", (event) => {
        if (attempt !== attemptRef.current) return
        rfbRef.current = null
        const kind = desktopCloseKind(closeCode)
        if (kind === "exhausted") {
          setNotice(null)
          setStatus("exhausted")
          refreshTime()
        } else if (kind === "ended") {
          // No automatic retry: the person reconnects when they want to
          setStatus("ended")
        } else {
          setStatus("disconnected")
        }
        // Unclean is the connection dropping, or never opening at all
        if (kind === "dropped" && !event.detail.clean) {
          Sentry.logger.warn("Desktop connection lost", { "chat.id": chatId })
        }
      })
      rfbRef.current = rfb
    } catch (error) {
      if (attempt !== attemptRef.current) return
      setStatus("disconnected")
      Sentry.logger.error("Desktop failed to open", {
        "chat.id": chatId,
        ...(error instanceof Error && { "error.message": error.message }),
      })
    }
  }, [chatId, getScreen, refreshTime])

  const disconnect = React.useCallback(() => {
    toggleRequestRef.current++
    attemptRef.current++
    rfbRef.current?.disconnect()
    rfbRef.current = null
  }, [])
  const close = React.useCallback(() => {
    disconnect()
    setStatus("idle")
    setNotice(null)
    setInUseBy(null)
    setOpen(false)
    setFullscreen(false)
  }, [disconnect])

  const toggle = React.useCallback(async () => {
    if (open) {
      close()
      return false
    }
    const request = ++toggleRequestRef.current
    // Showing the desktop starts the sandbox, on every plan while there is
    // time left. Without it the panel opens to say so.
    const hasTime = await hasUsageLeft("sandbox").catch(() => true)
    if (request !== toggleRequestRef.current) return false
    if (!hasTime) {
      setNotice(null)
      setStatus("exhausted")
      setOpen(true)
      refreshTime()
      return false
    }
    if (status !== "connected" && status !== "connecting") connect()
    setOpen(true)
    return true
  }, [open, status, connect, refreshTime, close])

  const openForLogin = React.useCallback(async () => {
    if (open || (await toggle())) setFullscreen(true)
  }, [open, toggle])

  const pause = React.useCallback(async () => {
    setStatus("pausing")
    try {
      const result = await pauseDesktop(chatId)
      if (!result.ok) {
        setStatus(rfbRef.current ? "connected" : "disconnected")
        toast.add({
          type: "error",
          title: "Couldn't pause the computer",
          description: result.message,
        })
        return
      }
      attemptRef.current++
      rfbRef.current?.disconnect()
      rfbRef.current = null
      setInUseBy(null)
      setStatus("paused")
    } catch {
      setStatus(rfbRef.current ? "connected" : "disconnected")
      toast.add({
        type: "error",
        title: "Couldn't pause the computer",
        description: "Try again.",
      })
    }
  }, [chatId])

  const reset = React.useCallback(async () => {
    const attempt = ++attemptRef.current
    const result = await resetDesktop(chatId)
    if (result.ok && attempt === attemptRef.current) await connect()
    return result
  }, [chatId, connect])

  const attachScreen = React.useCallback(
    (slot: HTMLElement) => {
      slot.appendChild(getScreen())
    },
    [getScreen]
  )

  const setInteractive = React.useCallback((interactive: boolean) => {
    interactiveRef.current = interactive
    const rfb = rfbRef.current
    if (!rfb) return
    rfb.viewOnly = !interactive
    if (interactive) rfb.focus()
  }, [])

  React.useEffect(() => {
    return disconnect
  }, [disconnect])

  // Bots take turns on the computer, so keep "In use by" current while it shows
  React.useEffect(() => {
    if (!open || status !== "connected") return
    const timer = setInterval(() => {
      getComputerInUse(chatId).then(
        ({ inUseBy }) => setInUseBy(inUseBy),
        () => {}
      )
    }, 15_000)
    return () => clearInterval(timer)
  }, [chatId, open, status])

  // The clock counts down from the server's figure, so refresh it now and then
  React.useEffect(() => {
    if (!open || status !== "connected") return
    const timer = setInterval(refreshTime, 60_000)
    return () => clearInterval(timer)
  }, [open, status, refreshTime])

  const value = React.useMemo(
    () => ({
      open,
      openForLogin,
      fullscreen,
      setFullscreen,
      toggle,
      close,
      status,
      notice,
      time,
      inUseBy,
      connect,
      pause,
      reset,
      attachScreen,
      setInteractive,
    }),
    [
      open,
      openForLogin,
      fullscreen,
      toggle,
      close,
      status,
      notice,
      time,
      inUseBy,
      connect,
      pause,
      reset,
      attachScreen,
      setInteractive,
    ]
  )

  return <DesktopPanelContext value={value}>{children}</DesktopPanelContext>
}

// Time left on the computer: always for the one-time free allowance, and for a
// paid account once the period's time is nearly gone
function DesktopClock() {
  const { time, status } = useDesktopPanel()
  const running = status === "connected"
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  if (!time || !showComputerClock(time.tier, time.remainingSeconds)) return null
  const left = running
    ? time.remainingSeconds - Math.max(0, now - time.at) / 1000
    : time.remainingSeconds
  return (
    <span className="mr-1 shrink-0 text-xs text-muted-foreground tabular-nums">
      {formatClock(left)} left
    </span>
  )
}

function DesktopControls() {
  const { status, connect, pause } = useDesktopPanel()
  return (
    <div className="flex shrink-0 items-center gap-1">
      <DesktopClock />
      <Button
        variant="ghost"
        size="sm"
        disabled={status !== "connected"}
        onClick={pause}
      >
        <PauseIcon /> <span className="hidden sm:inline">Pause</span>
        <span className="sr-only sm:hidden">Pause computer</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={status === "paused" ? "Resume computer" : "Reconnect"}
        disabled={
          status === "connecting" ||
          status === "pausing" ||
          status === "missing" ||
          status === "exhausted"
        }
        onClick={connect}
      >
        <RefreshCwIcon />
      </Button>
    </div>
  )
}

function DesktopInUse({ className }: { className?: string }) {
  const { inUseBy, status } = useDesktopPanel()
  if (!inUseBy || status !== "connected") return null
  return (
    <p role="status" className={className}>
      {inUseBy.name} is using the computer
    </p>
  )
}

function DesktopExhausted() {
  const { notice, time } = useDesktopPanel()
  const tier = time?.tier
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 px-4 text-center"
    >
      <p>{notice ?? computerTimeUsedUpMessage(tier)}</p>
      {tier === "paid" ? (
        <Link href="/usage" className={buttonVariants({ variant: "outline" })}>
          View usage
        </Link>
      ) : (
        <Link
          href="/pricing"
          className={buttonVariants({ variant: "outline" })}
        >
          See plans
        </Link>
      )}
    </div>
  )
}

function DesktopPlaceholder() {
  const { status, notice, connect, reset } = useDesktopPanel()
  if (status === "connected") return null
  return (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
      {status === "exhausted" ? (
        <DesktopExhausted />
      ) : status === "unavailable" ? (
        <div
          role="status"
          className="flex flex-col items-center gap-3 px-4 text-center"
        >
          <p>{notice}</p>
          <Button variant="outline" onClick={connect}>
            Try again
          </Button>
        </div>
      ) : status === "ended" ? (
        <div
          role="status"
          className="flex flex-col items-center gap-3 px-4 text-center"
        >
          <p>This computer session ended.</p>
          <Button variant="outline" onClick={connect}>
            Reconnect
          </Button>
        </div>
      ) : status === "missing" ? (
        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <p>Your computer no longer exists.</p>
          <DesktopResetDialog reset={reset} />
        </div>
      ) : status === "disconnected" || status === "paused" ? (
        <Button variant="outline" onClick={connect}>
          Resume computer
        </Button>
      ) : (
        <div className="flex items-center gap-3" role="status">
          <Spinner />{" "}
          {status === "pausing"
            ? "Pausing computer…"
            : "Connecting to computer…"}
        </div>
      )}
    </div>
  )
}

function DesktopPanel() {
  const {
    open,
    toggle,
    status,
    attachScreen,
    setInteractive,
    fullscreen,
    setFullscreen,
  } = useDesktopPanel()
  const isMobile = useIsMobile()
  const [panelSlot, setPanelSlot] = React.useState<HTMLDivElement | null>(null)
  const [dialogSlot, setDialogSlot] = React.useState<HTMLDivElement | null>(
    null
  )

  // The dialog's slot only exists while it is open, and wins while it does
  React.useLayoutEffect(() => {
    const slot = dialogSlot ?? panelSlot
    if (!slot) return
    attachScreen(slot)
    setInteractive(slot === dialogSlot)
  }, [dialogSlot, panelSlot, attachScreen, setInteractive])

  if (!open) return null

  const title = "Your computer"

  if (isMobile) {
    return (
      <Dialog
        open={open}
        onOpenChange={(nextOpen, details) => {
          // Escape belongs to the remote desktop; the explicit close control exits.
          if (!nextOpen && details.reason === "close-press") toggle()
        }}
        disablePointerDismissal
      >
        <DialogContent
          scrollable={false}
          initialFocus={false}
          className="flex h-svh max-w-none flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none"
        >
          <DialogHeader className="h-16 shrink-0 flex-row items-center gap-3 border-b px-4 pr-14">
            <DialogTitle className="min-w-0 flex-1 truncate p-0 text-sm">
              {title}
            </DialogTitle>
            <DesktopControls />
          </DialogHeader>
          <DialogDescription className="sr-only">
            Your computer, shared by all your bots. Close this view to return to
            the conversation.
          </DialogDescription>
          <div className="relative min-h-0 flex-1 bg-background">
            <div ref={setDialogSlot} className="absolute inset-0" />
            <DesktopPlaceholder />
          </div>
          <DesktopInUse className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground" />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <ResizableHandle withHandle />
      <ResizablePanel id="desktop" defaultSize="50%" minSize="20%">
        <Dialog
          open={fullscreen}
          onOpenChange={(open, eventDetails) => {
            // Escape belongs to the desktop; only the close button closes
            if (!open && eventDetails.reason !== "close-press") return
            setFullscreen(open)
          }}
          disablePointerDismissal
        >
          <div className="flex h-full flex-col bg-sidebar/50">
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4">
              <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {title}
              </span>
              <DesktopControls />
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6">
              <AspectRatio
                ratio={4 / 3}
                className="w-full max-w-2xl overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/10"
              >
                <div ref={setPanelSlot} className="absolute inset-0" />
                {status === "connected" ? (
                  <DialogTrigger
                    aria-label={`Open ${title} in fullscreen`}
                    className="absolute inset-0 cursor-zoom-in rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  />
                ) : (
                  <DesktopPlaceholder />
                )}
              </AspectRatio>
              <DesktopInUse className="text-xs text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Open the screen to control the computer.
              </p>
            </div>
          </div>
          <DialogContent
            scrollable={false}
            initialFocus={false}
            className="flex h-svh max-w-none flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none"
          >
            <DialogHeader className="h-16 shrink-0 justify-center border-b px-6">
              <DialogTitle className="text-sm">{title}</DialogTitle>
            </DialogHeader>
            <DialogDescription className="sr-only">
              Your computer, shared by all your bots. Close this view to return
              to the conversation.
            </DialogDescription>
            <div ref={setDialogSlot} className="min-h-0 flex-1 bg-background" />
          </DialogContent>
        </Dialog>
      </ResizablePanel>
    </>
  )
}

export { DesktopPanel, DesktopPanelProvider, useDesktopPanel }
