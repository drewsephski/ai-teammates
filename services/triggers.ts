import type { BotTriggerInsert, BotTriggerUpdate } from "@/db/schema"
import * as triggers from "@/lib/bot-triggers"
import { parseInboundEmail, recipientTokens } from "@/lib/inbound-email"
import { webhookContextHeaders, type InboundEmail } from "@/lib/trigger-policy"

// Event triggers are written once in lib/bot-triggers.ts. These are the
// owner's entry points, plus the two public ones that deliver events, whose
// only credential is the trigger's token.

export function listTriggers(userId: string, origin: string, botId?: string) {
  return triggers.listTriggers(userId, origin, botId)
}

export function createTrigger(
  userId: string,
  input: BotTriggerInsert,
  origin: string
) {
  return triggers.createTrigger(userId, input, origin)
}

export function updateTrigger(
  userId: string,
  triggerId: string,
  input: BotTriggerUpdate,
  origin: string
) {
  return triggers.updateTrigger(userId, triggerId, input, origin)
}

export function deleteTrigger(userId: string, triggerId: string) {
  return triggers.deleteTrigger(userId, triggerId)
}

// A call to a webhook trigger's URL
export function receiveWebhook(
  token: string,
  request: { headers: Headers; body: string }
) {
  const contentType = request.headers.get("content-type") ?? ""
  const headers = Object.fromEntries(
    webhookContextHeaders.flatMap((name) => {
      const value = request.headers.get(name)
      return value ? [[name, value.slice(0, 200)]] : []
    })
  )
  return triggers.receiveTriggerEvent(token, {
    kind: "webhook",
    key: triggers.webhookEventKey(request.headers, request.body),
    webhook: { contentType, body: request.body, headers },
  })
}

// Mail the inbound provider forwarded, for every trigger it is addressed to
export async function receiveEmail(
  input: Parameters<typeof parseInboundEmail>[0]
) {
  const domain = triggers.inboundEmailDomain()
  const email = parseInboundEmail(input)
  if (!domain || !email) return []
  return deliverEmail(email, domain)
}

async function deliverEmail(email: InboundEmail, domain: string) {
  const key = triggers.emailEventKey(email)
  const results = []
  for (const token of recipientTokens(email, domain))
    results.push(
      await triggers.receiveTriggerEvent(token, { kind: "email", key, email })
    )
  return results
}
