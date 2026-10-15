import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite-pgvector"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import { Pool } from "pg"

import * as schema from "../../db/schema"

// An in-memory Postgres with this app's schema, served over the wire
// protocol so the real db/index.ts (node-postgres) talks to it unchanged.
// Call before anything imports "@/db": it hands db/index.ts the pool to reuse.
export async function startTestDatabase() {
  const pg = await PGlite.create({ extensions: { vector } })
  await pg.exec("CREATE EXTENSION IF NOT EXISTS vector")
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema, undefined, undefined, "snake_case")
  )
  for (const statement of statements) await pg.exec(statement)

  const server = new PGLiteSocketServer({
    db: pg,
    port: 0,
    host: "127.0.0.1",
    // The app pool and the sandbox lock pool
    maxConnections: 2,
  })
  await server.start()
  const address = server.getServerConn()
  // PGlite runs one query at a time, so the app's pool gets one connection
  const pool = new Pool({ connectionString: `postgres://postgres@${address}/postgres`, max: 1 })
  // lib/sandbox-lock.ts holds its advisory locks on a pool of its own
  const lockPool = new Pool({ connectionString: `postgres://postgres@${address}/postgres`, max: 1 })
  Object.assign(globalThis, { pool, sandboxLockPool: lockPool })

  return {
    pool,
    async stop() {
      await Promise.all([pool.end(), lockPool.end()])
      await server.stop()
      await pg.close()
    },
  }
}
