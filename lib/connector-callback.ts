import { z } from "zod"

export const connectorCallbackSchema = z.object({
  state: z.uuid(),
  status: z.enum(["success", "failed"]),
  accountId: z.string().min(1).max(200),
})

export type ConnectorCallback = z.infer<typeof connectorCallbackSchema>

const attemptSchema = z.object({
  userId: z.string().min(1),
  accountId: z.string().min(1),
  toolkit: z.string().min(1),
})

export function connectorCookieName(state: string) {
  return `composio_connection_${z.uuid().parse(state)}`
}

type AccountPage = {
  items: {
    id: string
    status: string
    isDisabled: boolean
    toolkit: { slug: string }
  }[]
  nextCursor?: string | null
}

// Match the browser's attempt and signed-in owner before querying the provider.
export async function verifyConnectorCallback(
  userId: string,
  callback: ConnectorCallback,
  storedAttempt: string | undefined,
  loadAccounts: (
    userId: string,
    toolkit: string,
    cursor?: string
  ) => Promise<AccountPage>
) {
  if (callback.status !== "success" || !storedAttempt) return false
  let value: unknown
  try {
    value = JSON.parse(storedAttempt)
  } catch {
    return false
  }
  const attempt = attemptSchema.safeParse(value)
  if (
    !attempt.success ||
    attempt.data.userId !== userId ||
    attempt.data.accountId !== callback.accountId
  )
    return false

  let cursor: string | undefined
  do {
    const page = await loadAccounts(userId, attempt.data.toolkit, cursor)
    if (
      page.items.some(
        (account) =>
          account.id === callback.accountId &&
          account.toolkit.slug === attempt.data.toolkit &&
          account.status === "ACTIVE" &&
          !account.isDisabled
      )
    )
      return true
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return false
}
