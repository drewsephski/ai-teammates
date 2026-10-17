import * as Sentry from "@sentry/node"
import { and, count, desc, eq, gte } from "drizzle-orm"
import { createHash } from "node:crypto"

import { db } from "@/db"
import {
  botTriggerInsertSchema,
  botTriggerUpdateSchema,
  botTriggers,
  bots,
  triggerEvents,
  type BotTrigger,
  type BotTriggerInsert,
  type BotTriggerUpdate,
} from "@/db/schema"
import { postChatMessage } from "@/lib/chat-dispatch"
import { recordActivity } from "@/lib/notify"
import {
  routineOutcomeError,
  type RoutineRunOutcome,
} from "@/lib/routine-policy"
import { checkBotRun, reportChat } from "@/lib/routines"
import { teamOperationId } from "@/lib/team-policy"
import { assertBotAccess } from "@/lib/teammates"
import {
  assertTriggerCapacity,
  EMAIL_TRIGGERS_UNAVAILABLE_ERROR,
  emailAddress,
  emailEventText,
  isTriggerToken,
  newTriggerToken,
  parseTriggerEventMessageId,
  senderAllowed,
  TRIGGER_EVENTS_PER_HOUR,
  triggerEventMessageId,
  triggerEventPrompt,
  webhookEventText,
  webhookUrl,
  type InboundEmail,
  type WebhookEvent,
} from "@/lib/trigger-policy"
import { getAccountPlan } from "@/lib/usage"

// Event triggers: a bot wakes when its webhook is called or mail arrives at
// its address. Each accepted event posts into the trigger's chat as an
// unattended turn (message ID `event_<triggerId>_<key>`), after the checks a
// routine run passes. See docs/autonomy.md.

// The domain inbound mail arrives on; email triggers are off without it
export function inboundEmailDomain() {
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase()
  return domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)
    ? domain
    : undefined
}

export type PublicTrigger = Omit<BotTrigger, "userId" | "token"> & {
  // Webhook triggers: where to send events
  url: string | null
  // Email triggers: where to send mail
  address: string | null
}

// The URL and address carry the token: only ever shown to the trigger's owner
export function publicTrigger(row: BotTrigger, origin: string): PublicTrigger {
  const trigger: Partial<BotTrigger> = { ...row }
  delete trigger.userId
  delete trigger.token
  const domain = inboundEmailDomain()
  return {
    ...(trigger as Omit<BotTrigger, "userId" | "token">),
    url: row.kind === "webhook" ? webhookUrl(origin, row.token) : null,
    address:
      row.kind === "email" && domain ? emailAddress(row.token, domain) : null,
  }
}

export async function listTriggers(
  userId: string,
  origin: string,
  botId?: string
) {
  const rows = await db
    .select()
    .from(botTriggers)
    .where(
      and(
        eq(botTriggers.userId, userId),
        botId ? eq(botTriggers.botId, botId) : undefined
      )
    )
    .orderBy(desc(botTriggers.createdAt))
  return rows.map((row) => publicTrigger(row, origin))
}

async function ownedTrigger(userId: string, triggerId: string) {
  const [row] = await db
    .select()
    .from(botTriggers)
    .where(and(eq(botTriggers.id, triggerId), eq(botTriggers.userId, userId)))
  if (!row) throw new Error("Trigger not found")
  return row
}

// Idempotent on requestId, so a retried form returns the same trigger
export async function createTrigger(
  userId: string,
  input: BotTriggerInsert,
  origin: string
) {
  const values = botTriggerInsertSchema.parse(input)
  const id = teamOperationId(userId, "trigger", values.requestId)
  const [existing] = await db
    .select()
    .from(botTriggers)
    .where(and(eq(botTriggers.id, id), eq(botTriggers.userId, userId)))
  if (existing) return publicTrigger(existing, origin)

  if (values.kind === "email" && !inboundEmailDomain())
    throw new Error(EMAIL_TRIGGERS_UNAVAILABLE_ERROR)
  const [bot] = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.id, values.botId), eq(bots.userId, userId)))
  if (!bot) throw new Error("Bot not found")
  await assertBotAccess(userId, bot.id)
  const plan = await getAccountPlan(userId)
  const [{ total }] = await db
    .select({ total: count() })
    .from(botTriggers)
    .where(eq(botTriggers.userId, userId))
  assertTriggerCapacity(plan.tier, total)

  const chatId = await reportChat(userId, bot.id, id)
  const [row] = await db
    .insert(botTriggers)
    .values({
      id,
      userId,
      botId: bot.id,
      chatId,
      kind: values.kind,
      title: values.title,
      prompt: values.prompt,
      token: newTriggerToken(),
      allowedSenders: values.kind === "email" ? values.allowedSenders : [],
    })
    .onConflictDoNothing()
    .returning()
  return publicTrigger(row ?? (await ownedTrigger(userId, id)), origin)
}

export async function updateTrigger(
  userId: string,
  triggerId: string,
  input: BotTriggerUpdate,
  origin: string
) {
  const patch = botTriggerUpdateSchema.parse(input)
  const current = await ownedTrigger(userId, triggerId)
  const [row] = await db
    .update(botTriggers)
    .set({
      ...patch,
      // Only mail has senders
      ...(current.kind !== "email" && { allowedSenders: [] }),
    })
    .where(and(eq(botTriggers.id, triggerId), eq(botTriggers.userId, userId)))
    .returning()
  if (!row) throw new Error("Trigger not found")
  return publicTrigger(row, origin)
}

export async function deleteTrigger(userId: string, triggerId: string) {
  const [row] = await db
    .delete(botTriggers)
    .where(and(eq(botTriggers.id, triggerId), eq(botTriggers.userId, userId)))
    .returning({ id: botTriggers.id })
  if (!row) throw new Error("Trigger not found")
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32)

// Delivery IDs the common senders put on every request, so their retries
// post once
const deliveryHeaders = [
  "idempotency-key",
  "webhook-id",
  "x-github-delivery",
  "x-gitlab-event-uuid",
  "x-request-id",
]

// What identifies one delivery: the sender's delivery ID, or the body within
// ten minutes, which covers a sender retrying without one
export function webhookEventKey(
  headers: Headers,
  body: string,
  now = Date.now()
) {
  for (const name of deliveryHeaders) {
    const value = headers.get(name)?.trim()
    if (value) return hash(`${name}:${value}`)
  }
  return hash(`body:${Math.floor(now / 600_000)}:${body}`)
}

export function emailEventKey(email: InboundEmail) {
  return hash(
    email.messageId
      ? `message-id:${email.messageId}`
      : `mail:${email.from}:${email.subject}:${email.text}`
  )
}

export type TriggerEvent =
  | { kind: "webhook"; key: string; webhook: WebhookEvent }
  | { kind: "email"; key: string; email: InboundEmail }

export type TriggerEventResult =
  // Posted into the chat
  | "accepted"
  // Already posted: a retried delivery
  | "duplicate"
  // No such trigger, a paused one, or the wrong kind
  | "not_found"
  // Mail from someone the owner didn't list
  | "sender_refused"
  // Over TRIGGER_EVENTS_PER_HOUR
  | "rate_limited"
  // The owner's plan or allowance stopped it; recorded as activity
  | "skipped"
  // Couldn't wake the bot
  | "failed"

// What delivering an event needs from outside the database. Injected so
// tests run without Trigger.dev or Clerk.
export type TriggerEventDeps = {
  post: typeof postChatMessage
  check: (trigger: BotTrigger) => Promise<string | undefined>
}

const liveEventDeps: TriggerEventDeps = {
  post: postChatMessage,
  check: (trigger) => checkBotRun(trigger.userId, trigger.botId),
}

// Delivers one event to the trigger whose token it was sent to
export async function receiveTriggerEvent(
  token: string,
  event: TriggerEvent,
  deps: TriggerEventDeps = liveEventDeps,
  now = new Date()
): Promise<TriggerEventResult> {
  if (!isTriggerToken(token)) return "not_found"
  const [trigger] = await db
    .select()
    .from(botTriggers)
    .where(eq(botTriggers.token, token))
  if (!trigger || !trigger.enabled || trigger.kind !== event.kind)
    return "not_found"
  if (
    event.kind === "email" &&
    !senderAllowed(event.email.from, trigger.allowedSenders)
  )
    return "sender_refused"

  const messageId = triggerEventMessageId(trigger.id, event.key)
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(triggerEvents)
    .where(
      and(
        eq(triggerEvents.triggerId, trigger.id),
        gte(triggerEvents.createdAt, new Date(now.getTime() - 3_600_000))
      )
    )
  const [seen] = await db
    .select({ id: triggerEvents.id })
    .from(triggerEvents)
    .where(eq(triggerEvents.id, messageId))
  if (seen) return "duplicate"
  if (recent >= TRIGGER_EVENTS_PER_HOUR) {
    const hour = Math.floor(now.getTime() / 3_600_000)
    // Once an hour, so a flood doesn't flood the owner's phone as well
    await recordActivity(
      {
        userId: trigger.userId,
        kind: "event_skipped",
        title: `${trigger.title} is getting too many events`,
        detail: `Events past ${TRIGGER_EVENTS_PER_HOUR} an hour are dropped.`,
        botId: trigger.botId,
        chatId: trigger.chatId,
        dedupeKey: `trigger:${trigger.id}:limited:${hour}`,
      },
      {
        title: `${trigger.title} is getting too many events`,
        body: `Events past ${TRIGGER_EVENTS_PER_HOUR} an hour are dropped.`,
        path: "/activity",
      }
    )
    return "rate_limited"
  }
  const [claimed] = await db
    .insert(triggerEvents)
    .values({ id: messageId, triggerId: trigger.id, createdAt: now })
    .onConflictDoNothing()
    .returning({ id: triggerEvents.id })
  if (!claimed) return "duplicate"

  const reason = await deps.check(trigger)
  if (reason) {
    await db
      .update(botTriggers)
      .set({
        lastEventAt: now,
        lastEventId: messageId,
        lastStatus: "skipped",
        lastError: reason,
      })
      .where(eq(botTriggers.id, trigger.id))
    await recordActivity(
      {
        userId: trigger.userId,
        kind: "event_skipped",
        title: `${trigger.title} didn't run`,
        detail: reason,
        botId: trigger.botId,
        chatId: trigger.chatId,
        dedupeKey: `${messageId}:skipped`,
      },
      { title: `${trigger.title} didn't run`, body: reason, path: "/activity" }
    )
    return "skipped"
  }

  // Started before the post: the turn can report its outcome first
  await db
    .update(botTriggers)
    .set({
      lastEventAt: now,
      lastEventId: messageId,
      lastStatus: "started",
      lastError: null,
    })
    .where(eq(botTriggers.id, trigger.id))
  const text =
    event.kind === "email"
      ? emailEventText(event.email)
      : webhookEventText(event.webhook)
  try {
    await deps.post(
      trigger.chatId,
      {
        id: messageId,
        text: triggerEventPrompt(trigger, text),
        displayPrompt: `Trigger: ${trigger.title}`,
      },
      { botId: trigger.botId }
    )
  } catch (error) {
    Sentry.captureException(error, { extra: { triggerId: trigger.id } })
    // Let the sender's retry try again
    await db.delete(triggerEvents).where(eq(triggerEvents.id, messageId))
    await db
      .update(botTriggers)
      .set({ lastStatus: "failed", lastError: "Couldn't wake the bot." })
      .where(
        and(
          eq(botTriggers.id, trigger.id),
          eq(botTriggers.lastEventId, messageId)
        )
      )
    return "failed"
  }
  return "accepted"
}

// How an event's turn ended, reported by the turn itself. Only that owner's
// trigger, and only while that event is still its latest.
export async function recordTriggerOutcome(
  userId: string,
  messageId: string | undefined,
  outcome: RoutineRunOutcome
) {
  const event = parseTriggerEventMessageId(messageId)
  if (!event || !messageId) return { updated: false as const }
  const rows = await db
    .update(botTriggers)
    .set({
      lastStatus: outcome.status,
      lastError: routineOutcomeError(outcome),
    })
    .where(
      and(
        eq(botTriggers.id, event.triggerId),
        eq(botTriggers.userId, userId),
        eq(botTriggers.lastEventId, messageId)
      )
    )
    .returning({ id: botTriggers.id })
  return { updated: rows.length > 0 }
}
