import { tool } from "ai"
import { z } from "zod"
import { botInsertSchema, groupChatInsertSchema } from "@/db/schema"

export type TeamDestination = {
  chatId: string
  name: string
  kind: "direct" | "group"
}
export const specialistSchema = botInsertSchema.omit({ avatar: true })
const briefSchema = z.string().trim().min(1).max(12000)
export const teamGroupSchema = groupChatInsertSchema
  .omit({ botIds: true })
  .extend({
    botIds: z.array(z.string().min(1)).max(8).default([]),
    specialists: z.array(specialistSchema).max(8).default([]),
    prompt: briefSchema,
  })
  .superRefine((values, ctx) => {
    const members = new Set(values.botIds).size + values.specialists.length
    if (members < 2 || members > 8)
      ctx.addIssue({
        code: "custom",
        path: ["botIds"],
        message: "A group needs between two and eight different teammates.",
      })
  })

export function createTeamTools(operations: {
  list: () => Promise<{ id: string; name: string; job: string }[]>
  create: (
    input: z.infer<typeof specialistSchema> & { prompt: string }
  ) => Promise<TeamDestination>
  group: (input: z.infer<typeof teamGroupSchema>) => Promise<TeamDestination>
  delegate: (input: {
    botId: string
    prompt: string
  }) => Promise<TeamDestination>
}) {
  return {
    listTeammates: tool({
      description:
        "Find existing teammates and their roles before creating or delegating. Only your user's bots are listed.",
      inputSchema: z.object({}),
      execute: operations.list,
    }),
    createTeammate: tool({
      description:
        "Create a specialist bot with its own computer and chat, give it a complete task brief, and move the user to that chat. Explain what you are creating before calling. Use when a request is outside your role and no existing teammate fits. Stops your turn after success.",
      inputSchema: specialistSchema.extend({
        prompt: briefSchema.describe(
          "The user's task, relevant context, constraints and expected result. The new bot cannot see this conversation."
        ),
      }),
      execute: operations.create,
    }),
    createGroupChat: tool({
      description:
        "Create a group for work requiring multiple roles. List teammates first. Reuse existing owned botIds and optionally create new specialists with focused roles. The total must be two to eight teammates. Explain the team and task first. Starts a member and moves the user to the group chat. Stops your turn after success.",
      inputSchema: teamGroupSchema,
      execute: operations.group,
    }),
    delegateToTeammate: tool({
      description:
        "Give an existing teammate a task in a fresh direct chat and move the user there. List teammates first. Explain the handoff before calling, include complete context, then stop after success.",
      inputSchema: z.object({ botId: z.string().min(1), prompt: briefSchema }),
      execute: operations.delegate,
    }),
  }
}

export type TeamTools = ReturnType<typeof createTeamTools>
