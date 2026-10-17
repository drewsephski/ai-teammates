import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "node:crypto"

import { publicOrigin } from "@/lib/api-response"
import { slackConfig } from "@/lib/slack"
import { slackAuthorizeUrl } from "@/lib/slack-policy"

const SLACK_STATE_COOKIE = "krafty_slack_state"

// Starts adding Krafty to the person's Slack workspace. The state cookie ties
// Slack's callback to this browser, and the callback reads the account from
// the same signed-in session.
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.headers)
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", origin))
  const config = slackConfig()
  if (!config)
    return NextResponse.redirect(new URL("/activity?slack=unavailable", origin))
  const state = randomBytes(24).toString("base64url")
  const response = NextResponse.redirect(
    slackAuthorizeUrl(config.clientId, `${origin}/api/slack/callback`, state)
  )
  response.cookies.set(SLACK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    path: "/api/slack",
    maxAge: 600,
  })
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
