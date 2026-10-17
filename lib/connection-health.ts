// Per worker memory of connected accounts that were rejected during this run.
// Composio can keep calling an account ACTIVE for a while after its token
// died, so the run records what it saw, per account: a second account for the
// same app stays usable, the connect card offers a reconnect instead of
// "already connected", and the dead account isn't called again. A later turn
// is a new worker and reads Composio's own status.
//
// Two kinds. "expired": the credential is dead, so the account is treated as
// disconnected. "insufficient": the account works but lacks a permission, so
// it stays usable and only the reconnect offer changes.

export const CONNECTION_FLAG_MS = 30 * 60_000

export type RejectionKind = "expired" | "insufficient"
type Rejection = { toolkit: string; kind: RejectionKind; until: number }

const rejected = new Map<string, Rejection>()
const key = (userId: string, accountId: string) => `${userId}\u0000${accountId}`

export function flagAccountRejected(
  userId: string,
  toolkit: string,
  accountId: string,
  kind: RejectionKind,
  now = Date.now()
) {
  const current = rejected.get(key(userId, accountId))
  // A dead credential outranks a missing permission
  if (current?.kind === "expired" && current.until > now && kind !== "expired")
    return
  rejected.set(key(userId, accountId), {
    toolkit,
    kind,
    until: now + CONNECTION_FLAG_MS,
  })
}

function live(userId: string, now: number) {
  const prefix = `${userId}\u0000`
  const out: { accountId: string; rejection: Rejection }[] = []
  for (const [entry, rejection] of [...rejected]) {
    if (!entry.startsWith(prefix)) continue
    if (rejection.until <= now) rejected.delete(entry)
    else out.push({ accountId: entry.slice(prefix.length), rejection })
  }
  return out
}

function ofKind(userId: string, kind: RejectionKind, now: number) {
  return live(userId, now).filter(({ rejection }) => rejection.kind === kind)
}

// Accounts with a dead credential this run
export function expiredAccountIds(userId: string, now = Date.now()) {
  return new Set(ofKind(userId, "expired", now).map((e) => e.accountId))
}

export function accountExpired(
  userId: string,
  accountId: string,
  now = Date.now()
) {
  return expiredAccountIds(userId, now).has(accountId)
}

// Apps with at least one dead account this run
export function expiredToolkits(userId: string, now = Date.now()) {
  return new Set(ofKind(userId, "expired", now).map((e) => e.rejection.toolkit))
}

// Apps whose account works but lacked a permission this run
export function limitedToolkits(userId: string, now = Date.now()) {
  return new Set(
    ofKind(userId, "insufficient", now).map((e) => e.rejection.toolkit)
  )
}

export function resetConnectionHealth() {
  rejected.clear()
}
