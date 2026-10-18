import { setTimeout } from "node:timers/promises"
import { parseEnv } from "@neon/env"
import * as Sentry from "@sentry/node"
import { Pool } from "pg"

import config from "@/neon"

export function createSessionLockPool(applicationName: string, max: number) {
  const { postgres } = parseEnv(config, ["DATABASE_URL_UNPOOLED"])
  // Session locks require a direct connection, never a transaction pooler.
  // Separate from application connections; no transaction is held across E2B.
  const pool = new Pool({
    connectionString: postgres.databaseUrlUnpooled,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: applicationName,
    statement_timeout: 5000,
    query_timeout: 5000,
  })
  pool.on("error", (error) => Sentry.captureException(error))
  return pool
}

export async function acquireSessionLock<T>(
  pool: Pool,
  id: string,
  operation: (assertHeld: () => void) => Promise<T>,
  waitMs: number
) {
  const deadline = Date.now() + waitMs
  // A failed try owns no advisory lock. Return that connection before polling
  // again so same-key contenders cannot exhaust capacity needed by other keys.
  do {
    const client = await pool.connect()
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
      if (broken) return { acquired: false as const }
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
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await setTimeout(Math.min(100, remaining))
  } while (Date.now() < deadline)
  return { acquired: false as const }
}
