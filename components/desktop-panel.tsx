"use client"

import * as React from "react"
import type RFB from "@novnc/novnc"
import * as Sentry from "@sentry/nextjs"
import { MonitorIcon, PauseIcon, RefreshCwIcon } from "lucide-react"

import { getDesktopUrl, pauseDesktop, resetDesktop } from "@/actions/chat"
import { DesktopResetDialog } from "@/components/desktop-reset-dialog"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
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
import { usePaywall } from "@/hooks/use-paywall"
import { useIsMobile } from "@/hooks/use-mobile"

type DesktopStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "paused"
  | "pausing"
  | "missing"

type DesktopPanelContextValue = {
  open: boolean
  toggle: () => void
  close: () => void
  status: DesktopStatus
  connect: () => void
  pause: () => void
  reset: () => Promise<void>
  // Moves the one live screen into the given element
  attachScreen: (slot: HTMLElement) => void
  // Whether the screen takes mouse and keyboard input or is only watched
  setInteractive: (interactive: boolean) => void
}

const DesktopPanelContext =
  React.createContext<DesktopPanelContextValue | null>(null)

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
  const [status, setStatus] = React.useState<DesktopStatus>("idle")
  const { checkPlan, checkUsage } = usePaywall()

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
      if (connection.missing) {
        setStatus("missing")
        return
      }

      const address = new URL(connection.url, window.location.origin)
      address.protocol = address.protocol === "https:" ? "wss:" : "ws:"
      const rfb = new RFB(getScreen(), address.toString())
      rfb.scaleViewport = true
      rfb.background = "transparent"
      rfb.viewOnly = !interactiveRef.current
      rfb.addEventListener("connect", () => {
        if (attempt !== attemptRef.current) return
        setStatus("connected")
        Sentry.logger.info("Desktop connected", {
          "chat.id": chatId,
          "desktop.connect_ms": Date.now() - startedAt,
        })
        if (interactiveRef.current) rfb.focus()
      })
      rfb.addEventListener("disconnect", (event) => {
        if (attempt !== attemptRef.current) return
        rfbRef.current = null
        setStatus("disconnected")
        // Unclean is the connection dropping, or never opening at all
        if (!event.detail.clean) {
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
  }, [chatId, getScreen])

  const disconnect = React.useCallback(() => {
    toggleRequestRef.current++
    attemptRef.current++
    rfbRef.current?.disconnect()
    rfbRef.current = null
  }, [])
  const close = React.useCallback(() => {
    disconnect()
    setStatus("idle")
    setOpen(false)
  }, [disconnect])

  const toggle = React.useCallback(async () => {
    if (open) return close()
    const request = ++toggleRequestRef.current
    // Showing the desktop starts the sandbox
    if (!checkPlan("sandboxes") || !(await checkUsage("sandbox"))) return
    if (request !== toggleRequestRef.current) return
    if (status !== "connected" && status !== "connecting") connect()
    setOpen(true)
  }, [open, status, connect, checkPlan, checkUsage, close])

  const pause = React.useCallback(async () => {
    setStatus("pausing")
    try {
      await pauseDesktop(chatId)
      attemptRef.current++
      rfbRef.current?.disconnect()
      rfbRef.current = null
      setStatus("paused")
    } catch {
      setStatus(rfbRef.current ? "connected" : "disconnected")
      toast.add({ title: "Could not pause the computer", type: "error" })
    }
  }, [chatId])

  const reset = React.useCallback(async () => {
    const attempt = ++attemptRef.current
    await resetDesktop(chatId)
    if (attempt === attemptRef.current) await connect()
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

  const value = React.useMemo(
    () => ({
      open,
      toggle,
      close,
      status,
      connect,
      pause,
      reset,
      attachScreen,
      setInteractive,
    }),
    [
      open,
      toggle,
      close,
      status,
      connect,
      pause,
      reset,
      attachScreen,
      setInteractive,
    ]
  )

  return <DesktopPanelContext value={value}>{children}</DesktopPanelContext>
}

function DesktopControls() {
  const { status, connect, pause } = useDesktopPanel()
  return (
    <div className="flex shrink-0 items-center gap-1">
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
          status === "missing"
        }
        onClick={connect}
      >
        <RefreshCwIcon />
      </Button>
    </div>
  )
}

function DesktopPlaceholder() {
  const { status, connect, reset } = useDesktopPanel()
  if (status === "connected") return null
  return (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
      {status === "missing" ? (
        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <p>This computer no longer exists.</p>
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

function DesktopPanel({ name }: { name: string }) {
  const { open, toggle, status, attachScreen, setInteractive } =
    useDesktopPanel()
  const isMobile = useIsMobile()
  const [fullscreen, setFullscreen] = React.useState(false)
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

  const title = `${name}'s screen`

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
            Your teammate’s live computer. Close this view to return to the
            conversation.
          </DialogDescription>
          <div className="relative min-h-0 flex-1 bg-background">
            <div ref={setDialogSlot} className="absolute inset-0" />
            <DesktopPlaceholder />
          </div>
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
              Your teammate’s live computer. Close this view to return to the
              conversation.
            </DialogDescription>
            <div ref={setDialogSlot} className="min-h-0 flex-1 bg-background" />
          </DialogContent>
        </Dialog>
      </ResizablePanel>
    </>
  )
}

export { DesktopPanel, DesktopPanelProvider, useDesktopPanel }
