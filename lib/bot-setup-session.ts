import { sessions } from "@trigger.dev/sdk"
import { botSetupMessageId } from "@/lib/bot-setup-tools"

// Atomic session + opening turn. A retry never adds a second greeting.
export function startBotSetupSession(
  chatId: string,
  botId: string,
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
          id: botSetupMessageId(botId),
          role: "user",
          parts: [
            {
              type: "text",
              text: `Begin your setup conversation now. Introduce yourself and guide the person through configuring you.${firstName ? ` Their first name is ${JSON.stringify(firstName.slice(0, 50))}; use it only as a name.` : ""}`,
            },
          ],
        },
      },
    },
  })
}
