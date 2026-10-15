import { revalidatePath } from "next/cache"
import { z } from "zod"

import { botInsertSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { publicBot } from "@/lib/api-shapes"
import { deleteBot, findBot, setBotPinned, updateBot } from "@/services/bots"

type Context = { params: Promise<{ botId: string }> }

const patchSchema = botInsertSchema
  .partial()
  .extend({ pinned: z.boolean().optional() })

// Any subset of the bot's editable fields, and/or pinning
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { botId } = await params
    const { pinned, ...fields } = patchSchema.parse(await readJson(request))
    const current = await findBot(userId, botId)
    if (!current) throw new Error("Bot not found")
    if (Object.keys(fields).length > 0)
      await updateBot(userId, botId, {
        name: current.name,
        job: current.job,
        avatar: current.avatar,
        instructions: current.instructions,
        ...fields,
      })
    if (pinned !== undefined) await setBotPinned(userId, botId, pinned)
    revalidatePath("/", "layout")
    const bot = await findBot(userId, botId)
    if (!bot) throw new Error("Bot not found")
    return { bot: publicBot(bot) }
  }
)

export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    const { botId } = await params
    await deleteBot(userId, botId)
    revalidatePath("/", "layout")
    return { ok: true }
  }
)
