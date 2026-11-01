import { apiRoute } from "@/lib/api"
import { listRoutineRuns } from "@/services/routines"

type Context = { params: Promise<{ routineId: string }> }

// The routine's latest runs, newest first: status, why, and what each spent
// of the AI allowance (millionths of a dollar). ?limit= up to 50.
export const GET = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20)
    return {
      runs: await listRoutineRuns(
        userId,
        (await params).routineId,
        Number.isFinite(limit) ? limit : 20
      ),
    }
  }
)
