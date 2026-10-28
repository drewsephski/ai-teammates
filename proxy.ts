import { clerkMiddleware } from "@clerk/nextjs/server"
import { createGeoProxy } from "@usenotra/geo/next"
import { after, NextResponse } from "next/server"

const geo = createGeoProxy({
  token: process.env.NOTRA_GEO_TOKEN ?? "",
  endpoint: "https://ingest.usenotra.com",
})

export default clerkMiddleware(
  async (auth, request) => {
    // Register the SDK's actual send with Next so it survives the response.
    await geo(request, { waitUntil: (pending) => after(() => pending) })

    // Serve the site on the apex only, so search engines see one copy of each
    // page. Railway's proxy terminates TLS, so build the target from the Host
    // header rather than request.url, which is internal there.
    const host = request.headers.get("host") ?? ""
    if (host.toLowerCase() === "www.kraftybot.app") {
      const { pathname, search } = request.nextUrl
      return NextResponse.redirect(
        `https://kraftybot.app${pathname}${search}`,
        308
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
