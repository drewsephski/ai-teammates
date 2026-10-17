// Which connected account a tool call runs on. Pure, so the rule is tested
// without Composio. One account per toolkit runs without a choice; two or more
// need the person's pick, never a silent first-by-ID.

export type ChoosableAccount = {
  id: string
  toolkit: string
  // Composio's alias or word ID, when it has one
  label?: string
  connectedAt?: string
}

// What the model sees to ask the person which one
export type AccountChoice = {
  accountId: string
  label?: string
  connectedAt?: string
}

export function accountChoices(accounts: ChoosableAccount[]): AccountChoice[] {
  return accounts.map((account) => ({
    accountId: account.id,
    ...(account.label && { label: account.label }),
    ...(account.connectedAt && { connectedAt: account.connectedAt }),
  }))
}

export type AccountSelection =
  | { ok: true; account: ChoosableAccount }
  | { ok: false; reason: "none" }
  // A requested account that isn't one of this person's active accounts for
  // the toolkit
  | { ok: false; reason: "unknown"; choices: AccountChoice[] }
  | { ok: false; reason: "ambiguous"; choices: AccountChoice[] }

export function selectAccount(
  accounts: ChoosableAccount[],
  toolkit: string,
  requestedId?: string
): AccountSelection {
  const candidates = accounts.filter((account) => account.toolkit === toolkit)
  if (!candidates.length) return { ok: false, reason: "none" }
  if (requestedId) {
    const match = candidates.find((account) => account.id === requestedId)
    return match
      ? { ok: true, account: match }
      : { ok: false, reason: "unknown", choices: accountChoices(candidates) }
  }
  if (candidates.length === 1) return { ok: true, account: candidates[0] }
  return { ok: false, reason: "ambiguous", choices: accountChoices(candidates) }
}

// Toolkits with more than one active account
export function ambiguousToolkits(accounts: ChoosableAccount[]) {
  const byToolkit = new Map<string, ChoosableAccount[]>()
  for (const account of accounts)
    byToolkit.set(account.toolkit, [
      ...(byToolkit.get(account.toolkit) ?? []),
      account,
    ])
  return [...byToolkit]
    .filter(([, list]) => list.length > 1)
    .map(([toolkit, list]) => ({ toolkit, accounts: accountChoices(list) }))
}

// A started OAuth flow that never finished (cancelled, closed) holds the free
// plan's app slot only as long as the attempt itself can still complete.
export const PENDING_CONNECTION_MS = 10 * 60_000

export function holdsAppSlot(
  account: { status: string; createdAt?: string },
  now = Date.now()
) {
  if (account.status === "ACTIVE") return true
  if (account.status !== "INITIATED" && account.status !== "INITIALIZING")
    return false
  const created = account.createdAt ? Date.parse(account.createdAt) : NaN
  // Unknown age: keep holding the slot, as before
  return Number.isNaN(created) || now - created < PENDING_CONNECTION_MS
}

// Statuses of an account that worked once and needs the person to reconnect
export const RECONNECT_STATUSES = ["EXPIRED", "REVOKED", "INACTIVE"] as const
