import { tool } from "ai"
import { z } from "zod"

export type TeammateContribution = {
  botId: string
  name: string
  answer: string
}

export function createConsultationTool(
  consult: (
    input: { botId: string; prompt: string },
    options: { toolCallId: string; abortSignal?: AbortSignal }
  ) => Promise<TeammateContribution>
) {
  return {
    consultTeammate: tool({
      description:
        "Ask an existing owned teammate for advice and return their actual answer to this chat without navigation. Supply a complete brief with relevant context: they cannot see this conversation. They can read their recent direct chat and saved memory, but cannot execute tasks or take external actions during consultation. For execution use delegateToTeammate or group handoff instead. At most five distinct teammates per turn; never impersonate their answer.",
      inputSchema: z.object({
        botId: z.string().min(1).max(200),
        prompt: z.string().trim().min(1).max(12000),
      }),
      execute: consult,
    }),
  }
}

export type ConsultationTools = ReturnType<typeof createConsultationTool>
