import { revalidatePath } from "next/cache"

import { apiRoute } from "@/lib/api"
import { deleteModelKey } from "@/services/model-keys"

export const DELETE = apiRoute(
  async (
    { userId },
    _request,
    { params }: { params: Promise<{ provider: string }> }
  ) => {
    const { provider } = await params
    const keys = await deleteModelKey(userId, provider)
    revalidatePath("/", "layout")
    return { keys }
  }
)
