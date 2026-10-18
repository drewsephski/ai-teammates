import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { test } from "node:test"
import type { Pool } from "pg"

import { withAppleAccountLock } from "../lib/apple-account-lock"
import { acquireSessionLock } from "../lib/session-lock"
import { withSandboxLock } from "../lib/sandbox-lock"

// A bounded connection pool, including checkout timeouts and release/destroy
// accounting and advisory-key ownership; these tests target connection capacity
// and the shared engine's error/release behavior rather than PostgreSQL itself.
class BoundedPool {
  active = 0
  peak = 0
  destroyed = 0
  failUnlock = false
  failAcquire = false
  clients: LockClient[] = []
  locks = new Set<string>()
  deniedTries = 0
  onDenied?: () => void
  private waiters: (() => void)[] = []
  constructor(readonly max = 10) {}
  async connect() {
    if (this.active === this.max) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("pool checkout timeout")),
          1000
        )
        this.waiters.push(() => {
          clearTimeout(timeout)
          resolve()
        })
      })
    } else this.active++
    this.peak = Math.max(this.peak, this.active)
    const client = new LockClient(this)
    this.clients.push(client)
    return client
  }
  release(destroy: boolean) {
    if (destroy) this.destroyed++
    const next = this.waiters.shift()
    if (next) next()
    else this.active--
  }
  asPool() {
    return this as unknown as Pool
  }
}
class LockClient extends EventEmitter {
  private heldKey?: string
  constructor(private pool: BoundedPool) {
    super()
  }
  async query(query: string, parameters?: string[]) {
    if (query.includes("pg_advisory_unlock") && this.pool.failUnlock)
      throw new Error("unlock failed")
    if (query.includes("pg_try_advisory_lock") && this.pool.failAcquire)
      throw new Error("acquire failed")
    if (query.includes("pg_try_advisory_lock")) {
      const key = parameters![0]
      if (this.pool.locks.has(key)) {
        this.pool.deniedTries++
        this.pool.onDenied?.()
        return { rows: [{ acquired: false }] }
      }
      this.pool.locks.add(key)
      this.heldKey = key
    } else if (query.includes("pg_advisory_unlock")) {
      this.pool.locks.delete(parameters![0])
      this.heldKey = undefined
    }
    return { rows: [{ acquired: true }] }
  }
  release(destroy: boolean) {
    if (destroy && this.heldKey) this.pool.locks.delete(this.heldKey)
    this.pool.release(destroy)
  }
}

test("ten account deletion leases can all acquire nested ChatGPT and computer leases", async () => {
  const apple = new BoundedPool(10)
  const sandbox = new BoundedPool(10)
  const globals = globalThis as unknown as {
    appleAccountLockPool?: Pool
    sandboxLockPool?: Pool
  }
  const previous = {
    apple: globals.appleAccountLockPool,
    sandbox: globals.sandboxLockPool,
  }
  globals.appleAccountLockPool = apple.asPool()
  globals.sandboxLockPool = sandbox.asPool()
  let entered = 0
  let open!: () => void
  const allEntered = new Promise<void>((resolve) => {
    open = resolve
  })
  const completed: string[] = []
  try {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        withAppleAccountLock(`user_${index}`, async (assertHeld) => {
          if (++entered === 10) open()
          await allEntered
          assertHeld()
          for (const key of [`chatgpt:user_${index}`, `computer:user_${index}`])
            await withSandboxLock(key, async () => {
              completed.push(key)
            })
        })
      )
    )
    assert.equal(apple.peak, 10)
    assert.equal(completed.length, 20)
    assert.equal(sandbox.peak, 10)
    assert.equal(apple.active, 0)
    assert.equal(sandbox.active, 0)
    assert.equal(apple.destroyed + sandbox.destroyed, 0)
  } finally {
    globals.appleAccountLockPool = previous.apple
    globals.sandboxLockPool = previous.sandbox
  }
})

test("shared session engine preserves operation failure and releases healthy lease", async () => {
  const pool = new BoundedPool()
  await assert.rejects(
    acquireSessionLock(
      pool.asPool(),
      "test",
      async () => {
        throw new Error("operation failed")
      },
      0
    ),
    /operation failed/
  )
  assert.equal(pool.active, 0)
  assert.equal(pool.destroyed, 0)
  assert.equal(pool.clients[0].listenerCount("error"), 0)
})

test("detected session loss invalidates guard and destroys lease", async () => {
  const pool = new BoundedPool()
  await assert.rejects(
    acquireSessionLock(
      pool.asPool(),
      "test",
      async (assertHeld) => {
        pool.clients[0].emit("error", new Error("connection lost"))
        assertHeld()
      },
      0
    ),
    /lock connection was lost/
  )
  assert.equal(pool.active, 0)
  assert.equal(pool.destroyed, 1)
  assert.equal(pool.clients[0].listenerCount("error"), 0)
})

for (const failure of ["failAcquire", "failUnlock"] as const) {
  test(`${failure} destroys uncertain session without leaking capacity`, async () => {
    const pool = new BoundedPool()
    pool[failure] = true
    const result = acquireSessionLock(
      pool.asPool(),
      "test",
      async () => "done",
      0
    )
    if (failure === "failAcquire")
      await assert.rejects(result, /acquire failed/)
    else assert.deepEqual(await result, { acquired: true, value: "done" })
    assert.equal(pool.active, 0)
    assert.equal(pool.destroyed, 1)
    assert.equal(pool.clients[0].listenerCount("error"), 0)
  })
}

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test(
  "same-key contenders release failed checkouts so unrelated work runs before owner release",
  { timeout: 5000 },
  async () => {
    const pool = new BoundedPool(10)
    const entered = gate()
    const releaseOwner = gate()
    const attempted = gate()
    const owner = acquireSessionLock(
      pool.asPool(),
      "held",
      async () => {
        entered.release()
        await releaseOwner.promise
      },
      0
    )
    await entered.promise
    pool.onDenied = () => {
      if (pool.deniedTries >= 15) attempted.release()
    }
    const waiters = Array.from({ length: 15 }, () =>
      acquireSessionLock(
        pool.asPool(),
        "held",
        async () => assert.fail("owner still holds key"),
        200
      )
    )
    try {
      await attempted.promise
      assert.deepEqual(
        await acquireSessionLock(
          pool.asPool(),
          "unrelated",
          async () => "done",
          0
        ),
        { acquired: true, value: "done" }
      )
      assert.deepEqual(
        await Promise.all(waiters),
        Array.from({ length: 15 }, () => ({ acquired: false }))
      )
      assert.equal(pool.active, 1)
      assert.equal(pool.destroyed, 0)
      assert.equal(pool.locks.size, 1)
      for (const client of pool.clients.slice(1))
        assert.equal(client.listenerCount("error"), 0)
    } finally {
      releaseOwner.release()
      await owner
      await Promise.allSettled(waiters)
    }
    assert.equal(pool.active, 0)
    assert.equal(pool.locks.size, 0)
  }
)

test("a contended nonblocking attempt tries once and returns healthy capacity", async () => {
  const pool = new BoundedPool()
  pool.locks.add("held")
  assert.deepEqual(
    await acquireSessionLock(
      pool.asPool(),
      "held",
      async () => assert.fail("not acquired"),
      0
    ),
    { acquired: false }
  )
  assert.equal(pool.deniedTries, 1)
  assert.equal(pool.active, 0)
  assert.equal(pool.destroyed, 0)
  assert.equal(pool.clients[0].listenerCount("error"), 0)
  pool.locks.clear()
})

test("a polling contender acquires after release without leaking prior checkouts", async () => {
  const pool = new BoundedPool()
  pool.locks.add("held")
  pool.onDenied = () => {
    pool.locks.delete("held")
  }
  assert.deepEqual(
    await acquireSessionLock(pool.asPool(), "held", async () => "done", 500),
    { acquired: true, value: "done" }
  )
  assert.equal(pool.deniedTries, 1)
  assert.equal(pool.active, 0)
  assert.equal(pool.destroyed, 0)
  assert.equal(pool.locks.size, 0)
  for (const client of pool.clients)
    assert.equal(client.listenerCount("error"), 0)
})
