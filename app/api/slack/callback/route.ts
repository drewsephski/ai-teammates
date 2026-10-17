import { auth } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"

import { publicOrigin } from "@/lib/api-response"
import { completeSlackInstall } from "@/services/slack"

const SLACK_STATE_COOKIE = "krafty_slack_state"

function sameState(a: string | undefined, b: string | null) {
  if (!a || !b) return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Slack sends the person back here after they approve (or cancel) the install
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.headers)
  const back = (outcome: string) => {
    const response = NextResponse.redirect(
      new URL(`/activity?slack=${outcome}#slack`, origin)
    )
    response.cookies.delete({ name: SLACK_STATE_COOKIE, path: "/api/slack" })
    response.headers.set("Cache-Control", "no-store")
    return response
  }
  const params = request.nextUrl.searchParams
  if (
    !sameState(
      request.cookies.get(SLACK_STATE_COOKIE)?.value,
      params.get("state")
    )
  )
    return back("failed")
  if (params.get("error")) return back("cancelled")
  const code = params.get("code")
  const { userId } = await auth()
  if (!code || !userId) return back("failed")
  try {
    await completeSlackInstall(userId, {
      code,
      redirectUri: `${origin}/api/slack/callback`,
    })
    return back("connected")
  } catch {
    // Reported where it failed
    return back("failed")
  }
}
