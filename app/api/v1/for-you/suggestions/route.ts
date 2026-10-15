import { apiRoute } from "@/lib/api"
import { refreshForYou } from "@/services/for-you"

// Scans connected apps and returns the new suggestions. It runs a model and
// spends the AI allowance, so it is a POST that may take up to a minute.
// ?force=false only scans when the stored suggestions are stale.
export const POST = apiRoute(async (caller, request) => {
  const state = await refreshForYou(caller, {
    force: request.nextUrl.searchParams.get("force") !== "false",
  })
  const [top] = state.items
  return {
    ...state,
    // Single-card shape for app builds that predate `items`; token is the item ID
    card: top
      ? {
          title: top.title,
          description: top.reason,
          prompt: top.prompt,
          botId: top.bot.id,
          toolkit: top.toolkit ?? "memory",
          sourceId: top.id,
          sourceQuote: top.quote,
          token: top.id,
        }
      : null,
  }
})
