import type { AppAccount } from "@/lib/connector-tools"

type SessionFactory = (
  userId: string,
  toolkits: string[],
  connectedAccounts: Record<string, string[]>
) => Promise<{
  execute: (slug: string, input: Record<string, unknown>) => Promise<unknown>
}>

export async function executeConnectedAppTool(
  createSession: SessionFactory,
  userId: string,
  slug: string,
  input: Record<string, unknown>,
  account: AppAccount,
  signal?: AbortSignal
) {
  signal?.throwIfAborted()
  // Pin the owned account in session configuration. The per-call `account`
  // selector requires a Composio project feature that is not always enabled.
  const session = await createSession(userId, [account.toolkit], {
    [account.toolkit]: [account.id],
  })
  signal?.throwIfAborted()
  return session.execute(slug, input)
}
