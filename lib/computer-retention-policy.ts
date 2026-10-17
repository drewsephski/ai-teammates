// Pure rules for deleting a free account's idle computer. A paused computer
// still holds files, so the free plan keeps it for 30 days after its last use
// and then deletes it, files included. Paid computers are never deleted here.

export const FREE_RETENTION_DAYS = 30
export const FREE_RETENTION_MS = FREE_RETENTION_DAYS * 24 * 3_600_000
// How many plan lookups one metering run may spend on retention
export const RETENTION_BATCH = 25

export type RetentionRow = {
  userId: string
  sandboxId: string
  // Last lease taken or renewed, or a viewer connecting; null if never used
  lastUsedAt: Date | null
  createdAt: Date
  // A turn still holds the computer until then
  leaseExpiresAt: Date | null
}

export type ListedComputer = { state: "running" | "paused" }

function lastUse(row: Pick<RetentionRow, "lastUsedAt" | "createdAt">) {
  return (row.lastUsedAt ?? row.createdAt).getTime()
}

// Whether the computer has sat unused long enough, whatever the plan. Running
// computers and ones a turn still holds are never old.
export function isRetentionExpired(
  row: Pick<RetentionRow, "lastUsedAt" | "createdAt" | "leaseExpiresAt">,
  state: "running" | "paused",
  now: number
) {
  if (state !== "paused") return false
  if (row.leaseExpiresAt && row.leaseExpiresAt.getTime() > now) return false
  return now - lastUse(row) >= FREE_RETENTION_MS
}

// The decision once the plan is known. A plan that couldn't be read
// (`undefined`) keeps the computer: Clerk failing never deletes anyone's files.
export function shouldDeleteComputer(
  tier: "free" | "paid" | undefined,
  row: Pick<RetentionRow, "lastUsedAt" | "createdAt" | "leaseExpiresAt">,
  state: "running" | "paused",
  now: number
) {
  return tier === "free" && isRetentionExpired(row, state, now)
}

// Rows worth a plan lookup: expired by the clock and paused at the provider.
// Computers missing from the provider's list are not ours to delete here.
export function retentionCandidates(
  rows: RetentionRow[],
  listed: Map<string, ListedComputer>,
  now: number
) {
  return rows.filter((row) => {
    const computer = listed.get(row.sandboxId)
    return !!computer && isRetentionExpired(row, computer.state, now)
  })
}

// At most `size` candidates per run, rotating through the rest across runs, so
// accounts that need no deletion (paid ones) can't starve the others.
export function retentionBatch<T>(
  candidates: T[],
  now: number,
  size = RETENTION_BATCH,
  runLengthMs = 600_000
) {
  if (candidates.length <= size) return candidates
  const start = (Math.floor(now / runLengthMs) * size) % candidates.length
  return Array.from(
    { length: size },
    (_, index) => candidates[(start + index) % candidates.length]
  )
}

// Days left before a free computer is deleted, for a warning; null when the
// computer is in use, paid or already past the limit.
export function retentionDaysLeft(
  row: Pick<RetentionRow, "lastUsedAt" | "createdAt">,
  now: number
) {
  const left = lastUse(row) + FREE_RETENTION_MS - now
  return left > 0 ? Math.ceil(left / (24 * 3_600_000)) : null
}

// Copy for the apps. The first is shown ahead of deletion; the second once a
// new, empty computer replaces a deleted one.
export function retentionWarning(daysLeft: number) {
  return daysLeft === 1
    ? "Your free computer is deleted tomorrow if you don't use it. Its files can't be recovered."
    : `Your free computer is deleted in ${daysLeft} days if you don't use it. Its files can't be recovered.`
}
export const RETENTION_REMOVED_NOTICE =
  "Your free computer was deleted after 30 days without use, so this one starts empty."
