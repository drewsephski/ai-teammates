import { revalidatePath } from "next/cache"

import { routineUpdateSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { deleteRoutine, updateRoutine } from "@/services/routines"

type Context = { params: Promise<{ routineId: string }> }

// Pause with { enabled: false }; a new schedule or resuming restarts the clock
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const input = routineUpdateSchema.parse(await readJson(request))
    const routine = await updateRoutine(userId, (await params).routineId, input)
    revalidatePath("/activity")
    return { routine }
  }
)

export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    await deleteRoutine(userId, (await params).routineId)
    revalidatePath("/activity")
    return { ok: true }
  }
)
