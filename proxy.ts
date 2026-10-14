import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

export default clerkMiddleware(
  async (auth, request) => {
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
