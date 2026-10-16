import { apiRoute } from "@/lib/api"
import { desktopSocketUrl } from "@/lib/api-response"
import { createDesktopTicket } from "@/lib/desktop-ticket"
import { getDesktopUrl } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// Starts the account's computer if needed (one for all the person's bots) and returns where to stream it from.
// It spends sandbox time, so it's a POST. `url` carries a single-use ticket
// for this chat that expires at `expiresAt` (about a minute): connect right
// away, and ask again to reconnect. Session tokens never go in the URL.
export const POST = apiRoute<Context>(async (caller, request, { params }) => {
  const { chatId } = await params
  const desktop = await getDesktopUrl(caller, chatId)
  if (desktop.missing) return desktop
  const { ticket, expiresAt } = createDesktopTicket(
    { userId: caller.userId, chatId },
    process.env.CLERK_SECRET_KEY ?? ""
  )
  const url = new URL(desktopSocketUrl(request.headers, desktop.url))
  url.searchParams.set("ticket", ticket)
  // inUseBy: the bot whose turn holds the computer now, or null
  return { missing: false, url: url.href, expiresAt, inUseBy: desktop.inUseBy }
})
