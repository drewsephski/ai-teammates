import { revalidatePath } from "next/cache"

import { approvalRuleRevokeSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { listApprovalRules, revokeApprovalRule } from "@/services/approvals"

// The owner's "Always allow" rules: { rules: [{ botId, botName, toolSlug,
// accountId, createdAt }] }
export const GET = apiRoute(async ({ userId }) => ({
  rules: await listApprovalRules(userId),
}))

// { botId, toolSlug }. The bot asks again next time. 404 when there's no rule.
export const DELETE = apiRoute(async ({ userId }, request) => {
  const input = approvalRuleRevokeSchema.parse(await readJson(request))
  const result = await revokeApprovalRule(userId, input)
  revalidatePath("/activity")
  return result
})
