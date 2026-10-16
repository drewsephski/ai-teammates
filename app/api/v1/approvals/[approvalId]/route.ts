import { revalidatePath } from "next/cache"

import { approvalDecisionSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { decideApproval, getApproval } from "@/services/approvals"

type Context = { params: Promise<{ approvalId: string }> }

export const GET = apiRoute<Context>(
  async ({ userId }, _request, { params }) => ({
    approval: await getApproval(userId, (await params).approvalId),
  })
)

// { decision: "approve" | "always" | "deny" }. Wakes the bot that asked.
// A second decision on the same request is a 409 conflict.
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const input = approvalDecisionSchema.parse(await readJson(request))
    const result = await decideApproval(
      userId,
      (await params).approvalId,
      input
    )
    // The sidebar shows the pending count
    revalidatePath("/", "layout")
    return result
  }
)
