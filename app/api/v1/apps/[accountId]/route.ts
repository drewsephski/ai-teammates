import { revalidatePath } from "next/cache"

import { apiRoute } from "@/lib/api"
import { disconnectApp } from "@/services/connectors"

type Context = { params: Promise<{ accountId: string }> }

// Disconnects one of this person's connected accounts
export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    await disconnectApp(userId, (await params).accountId)
    revalidatePath("/workspace")
    return { ok: true }
  }
)
