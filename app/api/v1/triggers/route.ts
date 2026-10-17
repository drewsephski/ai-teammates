import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { botTriggerInsertSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { publicOrigin } from "@/lib/api-response"
import { createTrigger, listTriggers } from "@/services/triggers"

// ?botId= narrows the list to one bot
export const GET = apiRoute(async ({ userId }, request) => ({
  triggers: await listTriggers(
    userId,
    publicOrigin(request.headers),
    new URL(request.url).searchParams.get("botId") ?? undefined
  ),
}))

// Idempotent on requestId
export const POST = apiRoute(async ({ userId }, request) => {
  const input = botTriggerInsertSchema.parse(await readJson(request))
  const trigger = await createTrigger(
    userId,
    input,
    publicOrigin(request.headers)
  )
  revalidatePath("/activity")
  return NextResponse.json({ trigger }, { status: 201 })
})
