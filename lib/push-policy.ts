// Expo push message building and receipt handling. Pure; the sending lives in
// lib/notify.ts.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

export type PushNotification = {
  title: string
  body: string
  // An in-app path the tap opens, from the mobile deep-link allowlist
  path: string
  // Notification category registered by the app, for action buttons
  category?: "approval"
  data?: Record<string, string>
}

export function pushMessages(tokens: string[], notification: PushNotification) {
  return tokens.map((to) => ({
    to,
    title: notification.title.slice(0, 120),
    body: notification.body.slice(0, 240),
    sound: "default" as const,
    priority: "high" as const,
    data: { path: notification.path, ...notification.data },
    ...(notification.category && { categoryId: notification.category }),
  }))
}

type Ticket = { status?: string; details?: { error?: string } }

// Tokens Expo says no longer reach a device, in the order they were sent
export function unregisteredTokens(tokens: string[], response: unknown) {
  const tickets =
    response && typeof response === "object" && "data" in response
      ? (response as { data: unknown }).data
      : undefined
  if (!Array.isArray(tickets)) return []
  return tokens.filter((_, index) => {
    const ticket = tickets[index] as Ticket | undefined
    return (
      ticket?.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered"
    )
  })
}

// Expo accepts at most 100 messages per request
export function pushBatches<T>(messages: T[], size = 100) {
  const batches: T[][] = []
  for (let index = 0; index < messages.length; index += size)
    batches.push(messages.slice(index, index + size))
  return batches
}
