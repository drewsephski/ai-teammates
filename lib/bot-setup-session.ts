import { sessions } from "@trigger.dev/sdk"
import { botSetupMessageId } from "@/lib/bot-setup-tools"
import { botOpeningPrompt, type OpeningBot } from "@/lib/bot-opening"

// Atomic session + opening turn. A retry never adds a second greeting.
export function startBotSetupSession(
  chatId: string,
  bot: OpeningBot,
  firstName?: string | null
) {
  return sessions.start({
    type: "chat.agent",
    externalId: chatId,
    taskIdentifier: "chat",
    triggerConfig: {
      tags: [`chat:${chatId}`],
      basePayload: {
        chatId,
        trigger: "submit-message",
        message: {
          id: botSetupMessageId(bot.id),
          role: "user",
          parts: [
            {
              type: "text",
              text: botOpeningPrompt(bot, firstName),
            },
          ],
        },
      },
    },
  })
}
