import { setTimeout } from "node:timers/promises"
import { parseEnv } from "@neon/env"
import * as Sentry from "@sentry/node"
import { Pool } from "pg"

import config from "@/neon"
import { SANDBOX_BUSY_ERROR } from "@/lib/sandbox-policy"

const globalForLocks = globalThis as unknown as { sandboxLockPool?: Pool }

function createPool() {
  const { postgres } = parseEnv(config, ["DATABASE_URL_UNPOOLED"])
  // Session locks require a direct connection, never a transaction pooler.
  // Separate from application connections; no transaction is held across E2B.
  const pool = new Pool({
    connectionString: postgres.databaseUrlUnpooled,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: "ai-teammates-sandbox-lock",
    statement_timeout: 5000,
    query_timeout: 5000,
  })
  pool.on("error", (error) => Sentry.captureException(error))
  return pool
}

function getPool() {
  return (globalForLocks.sandboxLockPool ??= createPool())
}

export class SandboxBusyError extends Error {
  constructor() {
    super(SANDBOX_BUSY_ERROR)
    this.name = "SandboxBusyError"
  }
}

async function acquire<T>(
  id: string,
  operation: (assertHeld: () => void) => Promise<T>,
  waitMs: number
) {
  const client = await getPool().connect()
  let locked = false
  let broken = false
  const onError = (error: Error) => {
    broken = true
    Sentry.captureException(error, {
      tags: { "sandbox.operation": "lock-connection" },
      extra: { sandboxId: id },
    })
  }
  client.on("error", onError)
  try {
    const deadline = Date.now() + waitMs
    do {
      const result = await client.query<{ acquired: boolean }>(
        "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
        [id]
      )
      locked = result.rows[0].acquired
      if (locked) {
        const assertHeld = () => {
          if (broken)
            throw new Error("The account lock connection was lost. Try again.")
        }
        return { acquired: true as const, value: await operation(assertHeld) }
      }
      if (Date.now() >= deadline) break
      await setTimeout(100)
    } while (!broken)
    return { acquired: false as const }
  } catch (error) {
    // A failed acquisition may have reached Postgres even if its response was
    // lost. Closing the connection releases any lock with an uncertain result.
    if (!locked) broken = true
    throw error
  } finally {
    if (locked && !broken) {
      try {
        await client.query(
          "select pg_advisory_unlock(hashtextextended($1, 0))",
          [id]
        )
      } catch (error) {
        broken = true
        Sentry.captureException(error)
      }
    }
    client.removeListener("error", onError)
    // Destroy a failed connection so a session lock cannot leak into the pool.
    client.release(broken)
  }
}

export async function withSandboxLock<T>(
  id: string,
  operation: (assertHeld: () => void) => Promise<T>
) {
  const result = await acquire(id, operation, 10_000)
  if (!result.acquired) throw new SandboxBusyError()
  return result.value
}

export function tryWithSandboxLock<T>(
  id: string,
  operation: (assertHeld: () => void) => Promise<T>
) {
  return acquire(id, operation, 0)
}
