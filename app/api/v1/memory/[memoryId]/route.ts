import { revalidatePath } from "next/cache"

import { memoryUpdateSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { deleteMemory, updateMemory } from "@/services/memory"

type Context = { params: Promise<{ memoryId: string }> }

// Editing the text or kind makes a new version with a new ID; the old one is
// kept as history. Pin and scope change in place. The response has the ID to use.
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const values = memoryUpdateSchema.parse(await readJson(request))
    const saved = await updateMemory(userId, (await params).memoryId, values)
    revalidatePath("/memory")
    return { id: saved.id }
  }
)

// Deletes the memory and every earlier version of it
export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    await deleteMemory(userId, (await params).memoryId)
    revalidatePath("/memory")
    return { ok: true }
  }
)
