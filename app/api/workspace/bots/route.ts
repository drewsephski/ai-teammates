import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { listWorkspaceBots } from "@/services/workspace"

// Read-only polling uses GET, so it never queues behind UI server actions.
export async function GET() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return new NextResponse(null, { status: 401 })
  return NextResponse.json(
    { bots: await listWorkspaceBots(userId) },
    {
      headers: { "Cache-Control": "private, no-store" },
    }
  )
}
