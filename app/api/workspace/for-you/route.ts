import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { getForYou } from "@/services/for-you"

// Stored suggestions only; polling never starts a scan or spends AI credits.
export async function GET() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) return new NextResponse(null, { status: 401 })
  return NextResponse.json(
    { forYou: await getForYou(userId) },
    {
      headers: { "Cache-Control": "private, no-store" },
    }
  )
}
