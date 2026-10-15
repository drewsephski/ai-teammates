import { revalidatePath } from "next/cache"

import { apiRoute } from "@/lib/api"
import { resetDesktop } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

// Replaces the bot's computer with a fresh one
export const POST = apiRoute<Context>(async (caller, _request, { params }) => {
  await resetDesktop(caller, (await params).chatId)
  revalidatePath("/", "layout")
  return { ok: true }
})
