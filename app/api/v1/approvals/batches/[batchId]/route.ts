import { revalidatePath } from "next/cache"

import { approvalBatchDecisionSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { decideApprovalBatch } from "@/services/approvals"

type Context = { params: Promise<{ batchId: string }> }

// { decision: "approve" | "deny" } for every request still waiting from one
// reply (an approval's batchId). Each app action runs once; the bot wakes
// once, after the last. 404 when nothing from that reply is waiting.
export const PATCH = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const input = approvalBatchDecisionSchema.parse(await readJson(request))
    const result = await decideApprovalBatch(
      userId,
      (await params).batchId,
      input
    )
    revalidatePath("/", "layout")
    return result
  }
)
