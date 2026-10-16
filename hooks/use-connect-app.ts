"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/components/ui/toast"
import { FREE_APP_LIMIT_ERROR } from "@/lib/billing-policy"

export type ConnectAppContext = {
  chatId: string
  questionId: string
  botId: string
}

type ConnectAppResult =
  | { ok: true; url: string; accountId: string }
  | { ok: false; limitReached: true }

export type ConnectAppAction = (
  slug: string,
  context?: ConnectAppContext
) => Promise<ConnectAppResult>

// Loaded on demand so tests and previews never pull the server action (and
// the database behind it) into the module graph.
const connectViaAction: ConnectAppAction = async (slug, context) =>
  (await import("@/actions/connectors")).connectApp(slug, context)

/**
 * Starts an app connection in a new tab. The tab is reserved during the click
 * because browsers block tabs opened after an await. Resolves with the
 * authorization details, or undefined when the plan limit was hit or the
 * request failed (a toast explains both).
 */
export function useConnectApp({
  context,
  connect = connectViaAction,
}: {
  context?: ConnectAppContext
  connect?: ConnectAppAction
} = {}) {
  const router = useRouter()
  const [connecting, setConnecting] = useState(false)

  async function start(slug: string) {
    const popup = window.open("about:blank", "_blank")
    if (popup) popup.opener = null
    setConnecting(true)
    try {
      const result = await connect(slug, context)
      if (!result.ok) {
        popup?.close()
        toast.add({
          type: "error",
          title: "Connected app limit reached",
          description: FREE_APP_LIMIT_ERROR,
          actionProps: {
            children: "See plans",
            onClick: () => router.push("/pricing"),
          },
        })
        return undefined
      }
      if (popup) popup.location.replace(result.url)
      return { url: result.url, accountId: result.accountId }
    } catch (error) {
      popup?.close()
      toast.add({
        type: "error",
        title: "Connection failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
      return undefined
    } finally {
      setConnecting(false)
    }
  }

  return { start, connecting }
}
