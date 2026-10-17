import { NextResponse } from "next/server"

import { aiContentReportSchema } from "@/db/schema"
import { apiRoute, readJson } from "@/lib/api"
import { reportAIContent } from "@/services/ai-content-reports"

type Context = { params: Promise<{ chatId: string; messageId: string }> }

export const POST = apiRoute<Context>(
  async ({ userId }, request, { params }) => {
    const { chatId, messageId } = await params
    const result = await reportAIContent(
      userId,
      chatId,
      messageId,
      aiContentReportSchema.parse(await readJson(request))
    )
    return NextResponse.json(
      { reported: true },
      { status: result.created ? 201 : 200 }
    )
  }
)
