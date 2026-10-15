import { auth } from "@clerk/nextjs/server"

import type { WorkspaceBot } from "@/lib/workspace-activity"
import { listWorkspaceBots } from "@/services/workspace"

export async function getWorkspaceBots(): Promise<WorkspaceBot[]> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return listWorkspaceBots(userId)
}
