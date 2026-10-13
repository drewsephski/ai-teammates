type Computer = {
  sandboxId: string
  state: "running" | "paused"
  startedAt: Date
}
type Owner = { sandboxId: string; userId: string }

type Dependencies = {
  list: () => Promise<Computer[]>
  owners: () => Promise<Owner[]>
  meter: (id: string) => Promise<boolean>
  hasUsage: (userId: string) => Promise<boolean>
  pause: (id: string) => Promise<unknown>
  report: (error: unknown, id: string) => void
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
export async function runSandboxMetering(deps: Dependencies) {
  const [sandboxes, owners] = await Promise.all([deps.list(), deps.owners()])
  const errors: unknown[] = []
  let metered = 0
  let missing = 0
  let paused = 0
  async function attempt(id: string, operation: () => Promise<void>) {
    try {
      await operation()
    } catch (error) {
      errors.push(error)
      deps.report(error, id)
    }
  }
  await each(owners, (bot) =>
    attempt(bot.sandboxId, async () => {
      if (await deps.meter(bot.sandboxId)) metered++
      else missing++
    })
  )

  const byId = new Map(sandboxes.map((sandbox) => [sandbox.sandboxId, sandbox]))
  const users = [...new Set(owners.map((owner) => owner.userId))]
  const allowed = new Map<string, boolean>()
  await each(users, (userId) =>
    attempt(userId, async () => {
      allowed.set(userId, await deps.hasUsage(userId))
    })
  )
  await each(
    owners.filter((bot) => allowed.get(bot.userId) === false),
    (bot) =>
      attempt(bot.sandboxId, async () => {
        // Pause paused VMs too: a tool may have resumed one after the list.
        if (!byId.has(bot.sandboxId)) return
        await deps.pause(bot.sandboxId)
        paused++
      })
  )

  const owned = new Set(owners.map((bot) => bot.sandboxId))
  await each(
    sandboxes.filter(
      (sandbox) =>
        !owned.has(sandbox.sandboxId) &&
        sandbox.state === "running" &&
        // A freshly created VM may not have its bot row yet.
        Date.now() - sandbox.startedAt.getTime() >= 5 * 60_000
    ),
    (sandbox) =>
      attempt(sandbox.sandboxId, async () => {
        await deps.pause(sandbox.sandboxId)
        paused++
      })
  )
  if (errors.length)
    throw new AggregateError(
      errors,
      "Some computers could not be metered or paused"
    )
  return { metered, missing, paused }
}
