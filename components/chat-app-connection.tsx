"use client"

import { useRef, useState } from "react"
import { ConnectorLogo } from "@/components/connector-logo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useConnectApp, type ConnectAppAction } from "@/hooks/use-connect-app"
import { FREE_APP_LIMIT_ERROR } from "@/lib/billing-policy"
import type { AppConnectionCard } from "@/lib/bot-setup-tools"

// Must match APP_CONNECTION_OPTIONS in lib/bot-setup-tools.ts
const CONNECTED = "I've connected it"
const COMPUTER = "Use the computer instead"
const NOT_NOW = "Not now"

export function AppConnectionCardView({
  connection,
  busy,
  chatId,
  questionId,
  botId,
  onAnswer,
  connect,
}: {
  connection: AppConnectionCard
  busy: boolean
  chatId?: string
  questionId: string
  botId?: string
  onAnswer: (answer: string) => void | boolean | Promise<void | boolean>
  /** Injected in tests; defaults to the connectApp server action. */
  connect?: ConnectAppAction
}) {
  const locked = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [started, setStarted] = useState(false)
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

  async function connectNow() {
    if (disabled || connecting) return
    // The server wakes the bot once the connection completes in the new tab.
    if (await start(connection.toolkit)) setStarted(true)
  }

  return (
    <div
      className="flex max-w-sm flex-col gap-3 rounded-xl bg-muted/40 p-3"
      aria-label={`Connect ${connection.name}`}
    >
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
      {planLimit ? (
        <p className="text-xs text-muted-foreground">{FREE_APP_LIMIT_ERROR}</p>
      ) : (
        <p role="status" className="text-xs text-muted-foreground empty:hidden">
          {connecting
            ? "Opening the connection…"
            : started
              ? "Connecting… finish in the new window."
              : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {planLimit ? (
          <>
            <Button
              size="sm"
              nativeButton={false}
              render={<a href="/workspace" />}
            >
              Manage apps
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href="/pricing" />}
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
    </div>
  )
}
