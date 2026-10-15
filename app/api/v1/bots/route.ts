import { currentUser } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { apiRoute, readJson } from "@/lib/api"
import { publicBot } from "@/lib/api-shapes"
import { createBot, createBotInputSchema, listBots } from "@/services/bots"

export const GET = apiRoute(async ({ userId }) => ({
  bots: (await listBots(userId)).map(publicBot),
}))

// Same contract as the web's createBot: limits come back as data, not errors
export const POST = apiRoute(async (caller, request) => {
  const input = createBotInputSchema.parse(await readJson(request))
  const result = await createBot(
    caller,
    input,
    async () => (await currentUser())?.firstName
  )
  if (!result.ok) return result
  revalidatePath("/", "layout")
  return NextResponse.json(
    { ok: true, bot: publicBot(result.bot), chatId: result.chatId },
    { status: 201 }
  )
})
