import { NextResponse, type NextRequest } from "next/server"

import { mobileReturnLink } from "@/lib/mobile-connector"
import { mobileConnectionReturnUrl } from "@/services/connectors"

// The HTTPS page the provider returns to. It has no session of its own: it
// forwards the browser to the app link stored with the attempt, so the target
// is never taken from this request. Completing still needs the app's token.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const returnUrl = await mobileConnectionReturnUrl(
    params.get("connection_state") ?? ""
  )
  const response = returnUrl
    ? NextResponse.redirect(mobileReturnLink(returnUrl, params), 302)
    : new NextResponse(
        "This connection link expired. Go back to Krafty and connect the app again.",
        {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      )
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
