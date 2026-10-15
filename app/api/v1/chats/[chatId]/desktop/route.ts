import { apiRoute } from "@/lib/api"
import { desktopSocketUrl } from "@/lib/api-response"
import { getDesktopUrl } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// Starts the bot's computer if needed and returns where to stream it from.
// It spends sandbox time, so it's a POST. Connect to `url` with the same
// bearer token (Authorization header, or ?token= if headers can't be set).
export const POST = apiRoute<Context>(async (caller, request, { params }) => {
  const desktop = await getDesktopUrl(caller, (await params).chatId)
  if (desktop.missing) return desktop
  return {
    missing: false,
    url: desktopSocketUrl(request.headers, desktop.url),
  }
})
