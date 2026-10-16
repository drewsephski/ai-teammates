import { z } from "zod"

import {
  CONNECT_CONTEXT_ERROR,
  connectContextComplete,
  connectContextShape,
} from "@/lib/connect-context"

// Deep-link schemes the native app may ask to be sent back to after OAuth.
// Expo Go's exp:// links point at a developer's machine, so only in development.
export const MOBILE_APP_SCHEMES = [
  "krafty",
  ...(process.env.NODE_ENV === "production" ? [] : ["exp", "exps"]),
]

// The provider sends the browser here, then the bridge forwards to the app
export const MOBILE_CONNECTOR_CALLBACK_PATH =
  "/api/v1/apps/connections/callback"

export const MOBILE_CONNECTOR_ATTEMPT_MS = 10 * 60_000

export const mobileReturnUrlSchema = z
  .string()
  .trim()
  .max(500, "Return URL is too long")
  .refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return (
      MOBILE_APP_SCHEMES.includes(url.protocol.slice(0, -1)) &&
      !url.username &&
      !url.password
    )
  }, "Return URL must use the Krafty app scheme")

export const mobileConnectInputSchema = z
  .object({
    // beginAppConnection checks the toolkit slug format
    slug: z.string().min(1).max(100),
    returnUrl: mobileReturnUrlSchema,
    // Set by the connect card in a chat; beginMobileAppConnection checks them
    ...connectContextShape,
  })
  .refine(connectContextComplete, { message: CONNECT_CONTEXT_ERROR })

export type MobileConnectInput = z.infer<typeof mobileConnectInputSchema>

// The app link the bridge redirects to. Only the provider's three parameters
// are copied over, so nothing else in the callback query reaches the app.
export function mobileReturnLink(returnUrl: string, callback: URLSearchParams) {
  const link = new URL(returnUrl)
  link.searchParams.set(
    "connection_state",
    callback.get("connection_state") ?? ""
  )
  link.searchParams.set(
    "status",
    callback.get("status") === "success" ? "success" : "failed"
  )
  const accountId = callback.get("connected_account_id")
  if (accountId) link.searchParams.set("connected_account_id", accountId)
  else link.searchParams.delete("connected_account_id")
  return link.href
}
