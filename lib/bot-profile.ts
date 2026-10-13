import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { bots } from "@/db/schema"
import { botProfileSchema, type BotProfile } from "@/lib/bot-setup-tools"

// Both identity and ownership are supplied by the agent's server-owned chat.
export async function configureBotProfile(
  userId: string,
  botId: string,
  input: BotProfile
) {
  const profile = botProfileSchema.parse(input)
  const [saved] = await db
    .update(bots)
    .set({
      ...profile,
      instructions: profile.instructions || null,
      setupComplete: true,
    })
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning()
  if (!saved) throw new Error("This teammate was deleted or is not yours.")
  return { name: saved.name, job: saved.job, instructions: saved.instructions }
}
