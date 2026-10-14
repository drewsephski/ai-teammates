import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"

import {
  ChatGPTAuthError,
  chatGPTCookieName,
  completeChatGPTAuth,
} from "@/lib/chatgpt-auth"
import { chatGPTConfig } from "@/lib/chatgpt-config"
import { encryptChatGPTValue } from "@/lib/chatgpt-crypto"

export async function GET(request: NextRequest) {
  const config = chatGPTConfig()
  if (!config)
    return NextResponse.redirect(
      new URL("/sign-in?chatgpt=unavailable", request.url)
    )
  const { userId } = await auth()
  let response: NextResponse
  try {
    const result = await completeChatGPTAuth(
      request.nextUrl,
      request.cookies.get(chatGPTCookieName("oauth"))?.value,
      userId
    )
    response = NextResponse.redirect(
      new URL(
        result.ticket ? "/auth/chatgpt/complete" : "/usage?chatgpt=connected",
        config.origin
      )
    )
    if (result.ticket)
      response.cookies.set(
        chatGPTCookieName("session"),
        encryptChatGPTValue(
          JSON.stringify({
            ticket: result.ticket,
            expiresAt: Date.now() + 60_000,
          }),
          "chatgpt:signin-ticket",
          config.encryptionKey
        ),
        {
          httpOnly: true,
          secure: config.origin.startsWith("https:"),
          sameSite: "strict",
          path: "/",
          maxAge: 60,
        }
      )
  } catch (error) {
    const code = error instanceof ChatGPTAuthError ? error.code : "failed"
    response = NextResponse.redirect(
      new URL(
        `${userId ? "/usage" : "/sign-in"}?chatgpt=${code}`,
        config.origin
      )
    )
  }
  response.cookies.set(chatGPTCookieName("oauth"), "", {
    httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/", maxAge: 0,
  })
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
