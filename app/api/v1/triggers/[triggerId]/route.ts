import { revalidatePath } from "next/cache"

import { botTriggerUpdateSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { publicOrigin } from "@/lib/api-response"
import { deleteTrigger, updateTrigger } from "@/services/triggers"

type Context = { params: Promise<{ triggerId: string }> }

export const PATCH = apiRoute(
  async ({ userId }, request, { params }: Context) => {
    const { triggerId } = await params
    const input = botTriggerUpdateSchema.parse(await readJson(request))
    const trigger = await updateTrigger(
      userId,
      triggerId,
      input,
      publicOrigin(request.headers)
    )
    revalidatePath("/activity")
    return { trigger }
  }
)

export const DELETE = apiRoute(
  async ({ userId }, _request, { params }: Context) => {
    const { triggerId } = await params
    await deleteTrigger(userId, triggerId)
    revalidatePath("/activity")
    return { ok: true }
  }
)
