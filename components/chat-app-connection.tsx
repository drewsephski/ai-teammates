"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ConnectorLogo } from "@/components/connector-logo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAppConnectionResult } from "@/hooks/app-connection-channel"
import { useConnectApp, type ConnectAppAction } from "@/hooks/use-connect-app"
import type { AppConnectionCard } from "@/lib/bot-setup-tools"

// Must match APP_CONNECTION_OPTIONS in lib/bot-setup-tools.ts
const CONNECTED = "I've connected it"
const COMPUTER = "Use the computer instead"
const NOT_NOW = "Not now"

export function AppConnectionCardView({
  connection,
  question,
  busy,
  chatId,
  questionId,
  botId,
  botName,
  onAnswer,
  onResume,
  connect,
}: {
  connection: AppConnectionCard
  question: string
  busy: boolean
  chatId?: string
  questionId: string
  botId?: string
  botName?: string
  onAnswer: (answer: string) => void | boolean | Promise<void | boolean>
  /** Picks up the turn the server started after the connection completed. */
  onResume?: () => void
  /** Injected in tests; defaults to the connectApp server action. */
  connect?: ConnectAppAction
}) {
  const locked = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [started, setStarted] = useState(false)
  const [settled, setSettled] = useState(false)
  const [failed, setFailed] = useState(false)
  const { start, connecting } = useConnectApp({
    context: botId && chatId ? { chatId, questionId, botId } : undefined,
    connect,
  })
  const disabled = busy || submitting
  const planLimit = connection.state === "planLimit"

  async function answer(text: string) {
    if (locked.current || disabled) return
    locked.current = true
    setSubmitting(true)
    try {
      if ((await onAnswer(text)) === false) locked.current = false
    } catch {
      locked.current = false
    } finally {
      setSubmitting(false)
    }
  }

  // The popup finishes the connection in another tab and reports it here.
  useAppConnectionResult(questionId, (outcome) => {
    if (locked.current) return
    if (outcome === "settle") {
      // The server already woke the bot; attach to the turn it started.
      locked.current = true
      setSettled(true)
      setFailed(false)
      onResume?.()
    } else if (outcome === "answer") void answer(CONNECTED)
    else {
      setStarted(false)
      setFailed(true)
    }
  })

  async function connectNow() {
    if (disabled || connecting) return
    setFailed(false)
    if (await start(connection.toolkit)) setStarted(true)
  }

  const status = settled
    ? `Connected. ${botName ?? "Your teammate"} is continuing.`
    : connecting
      ? "Opening the connection…"
      : failed
        ? "The connection wasn't completed. Try Connect again."
        : started
          ? "Connecting… finish in the new window."
          : ""

  return (
    <div
      role="group"
      className="flex max-w-sm flex-col gap-3 rounded-xl bg-muted/40 p-3"
      aria-label={`Connect ${connection.name}`}
    >
      <p className="text-sm">{question}</p>
      <div className="flex items-center gap-3">
        <ConnectorLogo
          app={{
            slug: connection.toolkit,
            name: connection.name,
            logo: connection.logo ?? undefined,
          }}
        />
        <p className="text-sm font-medium">{connection.name}</p>
      </div>
      <p
        role="status"
        className={status ? "text-xs text-muted-foreground" : "sr-only"}
      >
        {status}
      </p>
      {!settled && (
        <div className="flex flex-wrap gap-2">
          {planLimit ? (
            <>
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/workspace" />}
              >
                Manage apps
              </Button>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href="/pricing" />}
              >
                See plans
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                disabled={disabled || connecting}
                onClick={() => void connectNow()}
              >
                {connecting && <Spinner data-icon="inline-start" />}
                Connect
              </Button>
              {started && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void answer(CONNECTED)}
                >
                  {CONNECTED}
                </Button>
              )}
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void answer(COMPUTER)}
          >
            {COMPUTER}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void answer(NOT_NOW)}
          >
            {NOT_NOW}
          </Button>
        </div>
      )}
    </div>
  )
}
