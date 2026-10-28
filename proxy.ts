import { clerkMiddleware } from "@clerk/nextjs/server"
import { createGeoProxy } from "@usenotra/geo/next"
import { after, NextResponse } from "next/server"

import { prefersMarkdown } from "@/lib/content-negotiation"
import { markdownHref, markdownPaths } from "@/lib/marketing/markdown"

const geo = createGeoProxy({
  token: process.env.NOTRA_GEO_TOKEN ?? "",
  endpoint: "https://ingest.usenotra.com",
})

export default clerkMiddleware(
  async (auth, request) => {
    // Railway's request URL is internal; attribute visits to the public host.
    const trackingUrl = new URL(request.url)
    const host = request.headers.get("host") ?? ""
    if (host) {
      trackingUrl.port = ""
      trackingUrl.host = host
    }
    trackingUrl.protocol =
      request.headers.get("x-forwarded-proto") === "https" ? "https:" : "http:"
    const trackingRequest = new Request(trackingUrl, {
      method: request.method,
      headers: request.headers,
    })
    // Register the SDK's actual send with Next so it survives the response.
    await geo(trackingRequest, { waitUntil: (pending) => after(() => pending) })

    // Serve the site on the apex only, so search engines see one copy of each
    // page. Railway's proxy terminates TLS, so build the target from the Host
    // header rather than request.url, which is internal there.
    if (host.toLowerCase() === "www.kraftybot.app") {
      const { pathname, search } = request.nextUrl
      return NextResponse.redirect(
        `https://kraftybot.app${pathname}${search}`,
        308
      )
    }
    // AI agents that ask for Markdown get the page's Markdown copy at the same
    // URL. Browsers never send text/markdown, so people always get HTML.
    if (
      markdownPaths.has(request.nextUrl.pathname) &&
      prefersMarkdown(request.headers.get("accept"))
    ) {
      return NextResponse.rewrite(
        new URL(markdownHref(request.nextUrl.pathname), request.url)
      )
    }
    if (request.nextUrl.pathname === "/pricing") {
      const { isAuthenticated } = await auth()
      if (!isAuthenticated) {
        return NextResponse.redirect(new URL("/#pricing", request.url))
      }
    }
  },
  {
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        // Rive and syntax highlighting compile WebAssembly, not arbitrary JS.
        "script-src": ["'wasm-unsafe-eval'"],
        // Chats render remote attachments and previews, and subscribe to
        // Trigger.dev. Keep these working alongside Clerk's payment/bot checks.
        "img-src": ["https:", "data:", "blob:"],
        "media-src": ["'self'", "https:", "data:", "blob:"],
        "font-src": ["'self'", "https:", "data:"],
        "frame-src": ["https:", "blob:"],
        "connect-src": [
          "https:",
          "wss:",
          ...(process.env.NODE_ENV === "production" ? [] : ["ws:"]),
        ],
      },
    },
  }
)

export const config = {
  matcher: [
    "/((?!_next|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
