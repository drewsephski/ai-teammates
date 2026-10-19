import { proxyChatInput } from "@/lib/chat-input-proxy"

type Context = { params: Promise<{ session: string }> }

// The chat transport's input append, sealed on the way to Trigger.dev. Web and
// app clients point the transport's "in" endpoint at /api/trigger; streaming
// replies still come from Trigger.dev directly. Authorized by the session
// token the client already holds, not a Clerk session (lib/chat-input-proxy.ts).
export async function POST(request: Request, { params }: Context) {
  return proxyChatInput(request, (await params).session)
}
