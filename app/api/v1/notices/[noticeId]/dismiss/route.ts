import { revalidatePath } from "next/cache"

import { apiRoute } from "@/lib/api"
import { dismissNotice } from "@/services/notices"

type Context = { params: Promise<{ noticeId: string }> }

export const POST = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    await dismissNotice(userId, (await params).noticeId)
    revalidatePath("/workspace")
    return { ok: true }
  }
)
