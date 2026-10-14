import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

import { chatGPTConfig } from "@/lib/chatgpt-config"
import { chatGPTCookieName, startChatGPTAuth } from "@/lib/chatgpt-auth"

export async function GET(request: NextRequest) {
  const config = chatGPTConfig()
  const { userId } = await auth()
  const requested = request.nextUrl.searchParams.get("intent")
  const intent = userId
    ? "connect"
    : requested === "sign-up"
      ? "sign-up"
      : "sign-in"
  const back = userId ? "/usage" : "/sign-in"
  if (!config)
    return NextResponse.redirect(
      new URL(`${back}?chatgpt=unavailable`, request.url)
    )
  if (request.nextUrl.origin !== config.origin)
    return NextResponse.json(
      { error: "Use the configured application URL to connect ChatGPT." },
      { status: 400 }
    )
  try {
    const attempt = await startChatGPTAuth(intent, userId)
    const response = NextResponse.redirect(attempt.url)
    response.cookies.set(chatGPTCookieName("oauth"), attempt.browserBinding, {
      httpOnly: true,
      secure: config.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    })
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
  } catch {
    return NextResponse.redirect(
      new URL(`${back}?chatgpt=failed`, config.origin)
    )
  }
}
