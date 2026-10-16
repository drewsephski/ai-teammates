import { apiRoute } from "@/lib/api"
import { listPendingApprovals } from "@/services/approvals"

export const GET = apiRoute(async ({ userId }) => ({
  approvals: await listPendingApprovals(userId),
}))
