import { revalidatePath } from "next/cache"

import { apiRoute } from "@/lib/api"
import { runRoutineNow } from "@/services/routines"

type Context = { params: Promise<{ routineId: string }> }

// Runs it once now; { status: "started" | "skipped" | "failed", chatId }
export const POST = apiRoute<Context>(
  async ({ userId }, _request, { params }) => {
    const result = await runRoutineNow(userId, (await params).routineId)
    revalidatePath("/activity")
    return result
  }
)
