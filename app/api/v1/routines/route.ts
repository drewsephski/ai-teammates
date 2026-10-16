import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import { routineInsertSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { createRoutine, listRoutines } from "@/services/routines"

// ?botId= narrows the list to one bot
export const GET = apiRoute(async ({ userId }, request) => ({
  routines: await listRoutines(
    userId,
    new URL(request.url).searchParams.get("botId") ?? undefined
  ),
}))

// Idempotent on requestId
export const POST = apiRoute(async ({ userId }, request) => {
  const input = routineInsertSchema.parse(await readJson(request))
  const routine = await createRoutine(userId, input)
  revalidatePath("/activity")
  return NextResponse.json({ routine }, { status: 201 })
})
