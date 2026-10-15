import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"

import { apiRoute, readJson } from "@/lib/api"
import { chatClientDataSchema } from "@/lib/composer"
import { startChatSession } from "@/services/chats"

type Context = { params: Promise<{ chatId: string }> }

const bodySchema = z.object({ clientData: chatClientDataSchema })

// Starts (or resumes) the chat's Trigger.dev session; the returned public
// access token is scoped to this chat's session only.
export const POST = apiRoute<Context>(async (caller, request, { params }) => {
  const { chatId } = await params
  const { clientData } = bodySchema.parse(await readJson(request))
  return startChatSession(
    caller,
    { chatId, clientData },
    async () => (await currentUser())?.firstName
  )
})
