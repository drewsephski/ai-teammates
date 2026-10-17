import {
  retentionBatch,
  retentionCandidates,
  shouldDeleteComputer,
  type RetentionRow,
} from "./computer-retention-policy"

type Computer = {
  sandboxId: string
  state: "running" | "paused"
  startedAt: Date
  // When the current or last session ends or ended, from the provider's list
  endAt?: Date
}
type Owner = { sandboxId: string; userId: string }

// Free-plan retention (lib/computer-retention-policy.ts)
export type Retention = {
  rows: () => Promise<RetentionRow[]>
  // Throws when the plan can't be read; that account is skipped this run
  tier: (userId: string) => Promise<"free" | "paid">
  // Deletes the computer and clears its row, rechecking under the account lock
  expire: (row: RetentionRow) => Promise<boolean>
}

type Dependencies<C extends Computer> = {
  list: () => Promise<C[]>
  owners: () => Promise<Owner[]>
  // Meters from the listed info, without asking the provider again
  meter: (computer: C) => Promise<boolean>
  hasUsage: (userId: string) => Promise<boolean>
  pause: (id: string) => Promise<unknown>
  // Deletes an orphan for good. Without it, orphans are only paused.
  kill?: (id: string) => Promise<unknown>
  report: (error: unknown, id: string) => void
  now?: () => number
  // Left out on runs that skip retention
  retention?: Retention
}

// A paused computer that hasn't run for this long has nothing left to meter.
// Recent ones are checked too: a tool may have resumed one after the list.
export const RECENT_MS = 10 * 60_000
// Unowned computers are paused after five minutes and deleted after a day
export const ORPHAN_PAUSE_MS = 5 * 60_000
export const ORPHAN_DELETE_MS = 24 * 3_600_000

export function isRecentlyActive(computer: Computer, now: number) {
  if (computer.state === "running") return true
  const last = Math.max(
    computer.startedAt.getTime(),
    computer.endAt?.getTime() ?? 0
  )
  return now - last < RECENT_MS
}

async function each<T>(items: T[], operation: (item: T) => Promise<void>) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (cursor < items.length) await operation(items[cursor++])
    })
  )
}

// Finish healthy accounts before throwing for a retry. Every completed billing
// write is idempotent, and one missing VM must not disable everybody's limits.
// Work scales with active computers, not with every bot that ever had one.
export async function runSandboxMetering<C extends Computer>(
  deps: Dependencies<C>
) {
  const now = deps.now?.() ?? Date.now()
  const [sandboxes, owners] = await Promise.all([deps.list(), deps.owners()])
  const errors: unknown[] = []
  let metered = 0
  let missing = 0
  let paused = 0
  let removed = 0
  let expired = 0
  async function attempt(id: string, operation: () => Promise<void>) {
    try {
      await operation()
    } catch (error) {
      errors.push(error)
      deps.report(error, id)
    }
  }

  const byId = new Map(sandboxes.map((sandbox) => [sandbox.sandboxId, sandbox]))
  const active = owners.filter((owner) => {
    const sandbox = byId.get(owner.sandboxId)
    if (!sandbox) missing++
    return sandbox && isRecentlyActive(sandbox, now)
  })
  await each(active, (owner) =>
    attempt(owner.sandboxId, async () => {
      if (await deps.meter(byId.get(owner.sandboxId)!)) metered++
      else missing++
    })
  )

  const users = [...new Set(active.map((owner) => owner.userId))]
  const allowed = new Map<string, boolean>()
  await each(users, (userId) =>
    attempt(userId, async () => {
      allowed.set(userId, await deps.hasUsage(userId))
    })
  )
  await each(
    active.filter((owner) => allowed.get(owner.userId) === false),
    (owner) =>
      attempt(owner.sandboxId, async () => {
        // Pause paused VMs too: a tool may have resumed one after the list.
        await deps.pause(owner.sandboxId)
        paused++
      })
  )

  const owned = new Set(owners.map((owner) => owner.sandboxId))
  const orphans = sandboxes.filter(
    (sandbox) =>
      !owned.has(sandbox.sandboxId) &&
      // A freshly created VM may not be registered on its account yet.
      now - sandbox.startedAt.getTime() >= ORPHAN_PAUSE_MS
  )
  await each(orphans, (sandbox) =>
    attempt(sandbox.sandboxId, async () => {
      if (deps.kill && now - sandbox.startedAt.getTime() >= ORPHAN_DELETE_MS) {
        await deps.kill(sandbox.sandboxId)
        removed++
      } else if (sandbox.state === "running") {
        await deps.pause(sandbox.sandboxId)
        paused++
      }
    })
  )

  if (deps.retention) {
    const retention = deps.retention
    const rows = await retention.rows()
    const candidates = retentionBatch(retentionCandidates(rows, byId, now), now)
    await each(candidates, (row) =>
      attempt(row.sandboxId, async () => {
        let tier: "free" | "paid" | undefined
        try {
          tier = await retention.tier(row.userId)
        } catch (error) {
          // Clerk failing never deletes files: leave this account for a later run
          deps.report(error, row.userId)
          return
        }
        const state = byId.get(row.sandboxId)!.state
        if (!shouldDeleteComputer(tier, row, state, now)) return
        if (await retention.expire(row)) expired++
      })
    )
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      "Some computers could not be metered or paused"
    )
  return {
    metered,
    missing,
    paused,
    removed,
    ...(deps.retention && { expired }),
  }
}
