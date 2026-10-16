type Computer = {
  sandboxId: string
  state: "running" | "paused"
  startedAt: Date
  // When the current or last session ends or ended, from the provider's list
  endAt?: Date
}
type Owner = { sandboxId: string; userId: string }

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
  async function attempt(id: string, operation: () => Promise<void>) {
    try {
      await operation()
    } catch (error) {
      errors.push(error)
      deps.report(error, id)
    }
  }

  const byId = new Map(sandboxes.map((sandbox) => [sandbox.sandboxId, sandbox]))
  const active = owners.filter((bot) => {
    const sandbox = byId.get(bot.sandboxId)
    if (!sandbox) missing++
    return sandbox && isRecentlyActive(sandbox, now)
  })
  await each(active, (bot) =>
    attempt(bot.sandboxId, async () => {
      if (await deps.meter(byId.get(bot.sandboxId)!)) metered++
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
    active.filter((bot) => allowed.get(bot.userId) === false),
    (bot) =>
      attempt(bot.sandboxId, async () => {
        // Pause paused VMs too: a tool may have resumed one after the list.
        await deps.pause(bot.sandboxId)
        paused++
      })
  )

  const owned = new Set(owners.map((bot) => bot.sandboxId))
  const orphans = sandboxes.filter(
    (sandbox) =>
      !owned.has(sandbox.sandboxId) &&
      // A freshly created VM may not have its bot row yet.
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
  if (errors.length)
    throw new AggregateError(
      errors,
      "Some computers could not be metered or paused"
    )
  return { metered, missing, paused, removed }
}
