"use server"

import { auth } from "@clerk/nextjs/server"

import type { UsageKind } from "@/db/schema"
import * as service from "@/services/usage"

// Whether the signed-in user's billing period has any of this allowance left
export async function hasUsageLeft(kind: UsageKind) {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  return service.hasUsageLeft(userId, kind)
}
