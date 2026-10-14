import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { chatGPTCookieName } from "@/lib/chatgpt-auth"
import { chatGPTConfig } from "@/lib/chatgpt-config"
import { decryptChatGPTValue } from "@/lib/chatgpt-crypto"

// Exchanges the short-lived HttpOnly completion cookie for a one-time Clerk
// ticket. OpenAI credentials never enter browser JavaScript or redirect URLs.
export async function POST(request: NextRequest) {
  const config = chatGPTConfig()
  if (!config || request.headers.get("origin") !== config.origin)
    return NextResponse.json(
      { error: "Sign-in could not be verified." },
      { status: 403 }
    )
  let response: NextResponse
  try {
    const value = request.cookies.get(chatGPTCookieName("session"))?.value
    if (!value) throw new Error("Missing completion")
    const result = z
      .object({
        ticket: z.string().min(1),
        expiresAt: z.number().gt(Date.now()),
      })
      .parse(
        JSON.parse(
          decryptChatGPTValue(
            value,
            "chatgpt:signin-ticket",
            config.encryptionKey
          )
        )
      )
    response = NextResponse.json({ ticket: result.ticket })
  } catch {
    response = NextResponse.json(
      { error: "Sign-in expired. Please try again." },
      { status: 401 }
    )
  }
  response.cookies.set(chatGPTCookieName("session"), "", {
    httpOnly: true,
    secure: config.origin.startsWith("https:"),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  })
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
