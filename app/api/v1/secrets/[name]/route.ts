import { revalidatePath } from "next/cache"

import { apiRoute } from "@/lib/api"
import { deleteSecret } from "@/services/secrets"

type Context = { params: Promise<{ name: string }> }

export const DELETE = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    const { name } = await params
    await deleteSecret(userId, name)
    revalidatePath("/workspace")
    return { deleted: true }
  }
)
