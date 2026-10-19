import { botSetupMessageId } from "@/lib/bot-setup-tools"
import { botOpeningPrompt, type OpeningBot } from "@/lib/bot-opening"
import { postChatMessage } from "@/lib/chat-dispatch"

// Session + opening turn. The greeting is sent once per bot, so a retry or a
// reopened setup chat never adds a second one. Its prompt carries the person's
// first name, so it goes through the sealed input stream, not basePayload.
export async function startBotSetupSession(
  chatId: string,
  bot: OpeningBot,
  firstName?: string | null
) {
  const sent = await postChatMessage(
    chatId,
    { id: botSetupMessageId(bot.id), text: botOpeningPrompt(bot, firstName) },
    { once: true }
  )
  if (!sent?.publicAccessToken) throw new Error("Couldn't reach the bot")
  return { publicAccessToken: sent.publicAccessToken }
}
