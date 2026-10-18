import assert from "node:assert/strict"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { after, before, beforeEach, test } from "node:test"
import { eq } from "drizzle-orm"

import { startTestDatabase } from "./helpers/test-db"
import type { AppleDeps } from "../services/apple"

const A = "user_a"
const B = "user_b"
const CLIENT = "app.kraftybot.mobile"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let apple: typeof import("../services/apple")
let lib: typeof import("../lib/apple-signin")

// A throwaway key, never a real Apple key
const env = {
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_SIWA_KEY_ID: "KEY1234567",
  APPLE_SIWA_PRIVATE_KEY: generateKeyPairSync("ec", { namedCurve: "P-256" })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString(),
  APPLE_SIWA_CLIENT_ID: CLIENT,
  APPLE_SIWA_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
}

// A fake appleid.apple.com: each code yields one refresh token for one Apple ID
type Mode = "ok" | "outage" | "invalid_client"
let apple_ = {
  codes: new Map<string, string>(),
  revoked: [] as string[],
  exchanged: [] as string[],
  revokeMode: "ok" as Mode,
  exchangeMode: "ok" as Mode,
}
const linked = new Map<string, string[]>()

const idToken = (sub: string) =>
  `e30.${Buffer.from(
    JSON.stringify({ iss: "https://appleid.apple.com", aud: CLIENT, sub })
  ).toString("base64url")}.sig`

const fetcher = (async (url: string | URL, init?: RequestInit) => {
  const form = new URLSearchParams(String(init?.body))
  const fail = (mode: Mode) =>
    mode === "outage"
      ? new Response("down", { status: 503 })
      : Response.json({ error: "invalid_client" }, { status: 400 })
  if (String(url).endsWith("/auth/token")) {
    if (apple_.exchangeMode !== "ok") return fail(apple_.exchangeMode)
    const code = form.get("code")!
    const sub = apple_.codes.get(code)
    // Codes are single-use
    if (!sub || apple_.exchanged.includes(code))
      return Response.json({ error: "invalid_grant" }, { status: 400 })
    apple_.exchanged.push(code)
    return Response.json({
      access_token: "access",
      refresh_token: `refresh_for_${code}`,
      id_token: idToken(sub),
    })
  }
  if (apple_.revokeMode !== "ok") return fail(apple_.revokeMode)
  apple_.revoked.push(form.get("token")!)
  return new Response(null, { status: 200 })
}) as typeof fetch

function deps(overrides: Partial<AppleDeps> = {}): AppleDeps {
  return {
    withAccountLock: async (_userId, operation) => operation(() => {}),
    config: () => lib.appleSignInConfig(env),
    appleSubjects: async (userId) => linked.get(userId) ?? [],
    fetcher,
    ...overrides,
  }
}

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  apple = await import("../services/apple")
  lib = await import("../lib/apple-signin")
})

beforeEach(async () => {
  await db.delete(schema.appleSignInGrants)
  apple_ = {
    codes: new Map([
      ["code_a", "apple_a"],
      ["code_a2", "apple_a"],
      ["code_b", "apple_b"],
    ]),
    revoked: [],
    exchanged: [],
    revokeMode: "ok",
    exchangeMode: "ok",
  }
  linked.clear()
  linked.set(A, ["apple_a"])
  linked.set(B, ["apple_b"])
})

after(async () => {
  await database?.stop()
})

test("a sign-in code is exchanged and the refresh token stored encrypted", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  const [row] = await db.select().from(schema.appleSignInGrants)
  assert.equal(row!.userId, A)
  assert.equal(row!.clientId, CLIENT)
  assert.equal(row!.subject, "apple_a")
  assert.ok(!row!.refreshToken.includes("refresh_for_code_a"))
  const key = Buffer.from(env.APPLE_SIWA_TOKEN_ENCRYPTION_KEY, "hex")
  assert.equal(
    lib.decryptAppleRefreshToken(row!.refreshToken, A, CLIENT, key),
    "refresh_for_code_a"
  )
  // Signing in again replaces the token instead of adding a row
  await apple.saveAppleAuthorization(A, "code_a2", deps())
  const rows = await db.select().from(schema.appleSignInGrants)
  assert.equal(rows.length, 1)
  assert.equal(
    lib.decryptAppleRefreshToken(rows[0]!.refreshToken, A, CLIENT, key),
    "refresh_for_code_a2"
  )
})

test("a code for an Apple ID linked to another account is not stored", async () => {
  // B posts A's code: the Apple ID isn't linked to B
  await assert.rejects(
    apple.saveAppleAuthorization(B, "code_a", deps()),
    /Apple account not found/
  )
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
  // Nothing was revoked on A's behalf either
  assert.deepEqual(apple_.revoked, [])
})

test("saving fails closed without the Apple key", async () => {
  await assert.rejects(
    apple.saveAppleAuthorization(
      A,
      "code_a",
      deps({ config: () => lib.appleSignInConfig({}) })
    ),
    /Couldn't save your Sign in with Apple/
  )
  assert.deepEqual(apple_.exchanged, [])
})

test("deletion revokes the stored token, and only the owner's", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  await apple.saveAppleAuthorization(B, "code_b", deps())
  assert.equal(await apple.revokeAppleSignIn(B, undefined, deps()), "revoked")
  assert.deepEqual(apple_.revoked, ["refresh_for_code_b"])
})

test("a fresh code at deletion covers an account with no stored token", async () => {
  assert.equal(await apple.revokeAppleSignIn(A, "code_a", deps()), "revoked")
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
})

test("a code for someone else's Apple ID is never revoked", async () => {
  assert.equal(await apple.revokeAppleSignIn(A, "code_b", deps()), "manual")
  assert.deepEqual(apple_.revoked, [])
})

test("without a token or code an Apple account gets the manual fallback", async () => {
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "manual")
  // A used code falls back too
  apple_.exchanged.push("code_a")
  assert.equal(await apple.revokeAppleSignIn(A, "code_a", deps()), "manual")
  assert.deepEqual(apple_.revoked, [])
})

test("an account that never used Apple needs nothing", async () => {
  linked.delete(A)
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "none")
  // Even with the key missing
  assert.equal(
    await apple.revokeAppleSignIn(
      A,
      undefined,
      deps({ config: () => lib.appleSignInConfig({}) })
    ),
    "none"
  )
  assert.deepEqual(apple_.exchanged, [])
})

test("a missing key or a rejected request can't block deletion", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  assert.equal(
    await apple.revokeAppleSignIn(
      A,
      undefined,
      deps({ config: () => lib.appleSignInConfig({}) })
    ),
    "manual"
  )
  apple_.revokeMode = "invalid_client"
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "manual")
  assert.deepEqual(apple_.revoked, [])
})

test("an Apple outage throws so deletion stops and can be retried", async () => {
  await apple.saveAppleAuthorization(A, "code_a", deps())
  apple_.revokeMode = "outage"
  await assert.rejects(
    apple.revokeAppleSignIn(A, undefined, deps()),
    /Couldn't revoke Sign in with Apple/
  )
  apple_.revokeMode = "ok"
  apple_.exchangeMode = "outage"
  await assert.rejects(
    apple.revokeAppleSignIn(A, "code_a2", deps()),
    /Couldn't revoke Sign in with Apple/
  )
  await assert.rejects(
    apple.revokeAppleSignIn(
      A,
      undefined,
      deps({
        appleSubjects: async () => {
          throw new Error("clerk down")
        },
      })
    ),
    /Couldn't revoke Sign in with Apple/
  )
})

test("account deletion revokes Apple before deleting, then drops the grant", async () => {
  const account = await import("../services/account")
  await apple.saveAppleAuthorization(A, "code_a", deps())
  await apple.saveAppleAuthorization(B, "code_b", deps())
  const calls: string[] = []
  const steps = {
    cancelSubscriptions: async () => {
      calls.push("billing")
    },
    revokeApple: async (userId: string, code: string | undefined) => {
      calls.push("apple")
      return apple.revokeAppleSignIn(userId, code, deps())
    },
    closeChat: async () => {},
    deleteComputer: async () => {},
    deleteBot: async () => {},
    disconnectChatGPT: async () => {
      calls.push("chatgpt")
    },
    disconnectApps: async () => {},
    deleteUser: async () => {
      calls.push("clerk")
    },
  }

  // An outage leaves the grant in place and the Clerk user alive
  apple_.revokeMode = "outage"
  await assert.rejects(account.deleteAccount(A, steps), /Couldn't revoke/)
  assert.deepEqual(calls, ["billing", "apple"])
  assert.equal(
    (
      await db
        .select()
        .from(schema.appleSignInGrants)
        .where(eq(schema.appleSignInGrants.userId, A))
    ).length,
    1
  )

  apple_.revokeMode = "ok"
  calls.length = 0
  assert.deepEqual(await account.deleteAccount(A, steps), {
    appleSignIn: "revoked",
  })
  assert.deepEqual(calls, ["billing", "apple", "chatgpt", "clerk", "apple"])
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a", "refresh_for_code_a"])
  assert.deepEqual(
    (await db.select().from(schema.appleSignInGrants)).map((row) => row.userId),
    [B]
  )
})

// A fresh code cannot be exchanged twice, including after an Apple outage.
test("fresh deletion tokens survive a revoke outage for a bodiless retry", async () => {
  apple_.revokeMode = "outage"
  await assert.rejects(
    apple.revokeAppleSignIn(A, "code_a", deps()),
    /Couldn't revoke Sign in with Apple/
  )
  apple_.revokeMode = "ok"
  assert.equal(await apple.revokeAppleSignIn(A, undefined, deps()), "revoked")
  assert.deepEqual(apple_.exchanged, ["code_a"])
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
})

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function serializedAccounts(): AppleDeps["withAccountLock"] {
  const tails = new Map<string, Promise<void>>()
  return async (userId, operation) => {
    const prior = tails.get(userId) ?? Promise.resolve()
    const next = gate()
    tails.set(userId, next.promise)
    await prior
    try {
      return await operation(() => {})
    } finally {
      next.release()
    }
  }
}

function deletionSteps(appleDeps: AppleDeps) {
  return {
    withAppleLock: appleDeps.withAccountLock,
    cancelSubscriptions: async () => {},
    revokeApple: (userId: string, code: string | undefined) =>
      apple.revokeAppleSignIn(userId, code, appleDeps),
    closeChat: async () => {},
    deleteComputer: async () => {},
    deleteBot: async () => {},
    disconnectChatGPT: async () => {},
    disconnectApps: async () => {},
    deleteUser: async (userId: string) => {
      linked.delete(userId)
    },
  }
}

test("a save already exchanging completes before deletion snapshots and revokes its grant", async () => {
  const account = await import("../services/account")
  const entered = gate()
  const resume = gate()
  const injected = deps({
    withAccountLock: serializedAccounts(),
    fetcher: (async (...args: Parameters<typeof fetch>) => {
      if (String(args[0]).endsWith("/auth/token")) {
        entered.release()
        await resume.promise
      }
      return fetcher(...args)
    }) as typeof fetch,
  })
  const saving = apple.saveAppleAuthorization(A, "code_a", injected)
  await entered.promise
  const deleting = account.deleteAccount(A, deletionSteps(injected))
  assert.deepEqual(apple_.revoked, [])
  resume.release()
  await saving
  assert.deepEqual(await deleting, { appleSignIn: "revoked" })
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a", "refresh_for_code_a"])
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
})

test("a save queued during deletion rechecks Clerk and never exchanges or recreates a grant", async () => {
  const account = await import("../services/account")
  const entered = gate()
  const resume = gate()
  const injected = deps({ withAccountLock: serializedAccounts() })
  const steps = {
    ...deletionSteps(injected),
    disconnectApps: async () => {
      entered.release()
      await resume.promise
    },
  }
  const deleting = account.deleteAccount(A, steps)
  await entered.promise
  const saving = assert.rejects(
    apple.saveAppleAuthorization(A, "code_a", injected),
    /Apple account not found/
  )
  resume.release()
  await deleting
  await saving
  assert.deepEqual(apple_.exchanged, [])
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
})

test("detected lock loss before cleanup keeps the grant and Clerk account", async () => {
  const account = await import("../services/account")
  await apple.saveAppleAuthorization(A, "code_a", deps())
  let lost = false
  let deletedUser = false
  const injected = deps({
    withAccountLock: async (_userId, operation) =>
      operation(() => {
        if (lost) throw new Error("lock lost")
      }),
  })
  await assert.rejects(
    account.deleteAccount(A, {
      ...deletionSteps(injected),
      disconnectApps: async () => {
        lost = true
      },
      deleteUser: async () => {
        deletedUser = true
      },
    }),
    /lock lost/
  )
  assert.equal(deletedUser, false)
  assert.equal((await db.select().from(schema.appleSignInGrants)).length, 1)
})

test("detected lock loss during exchange revokes the new token instead of persisting", async () => {
  let lost = false
  const injected = deps({
    withAccountLock: async (_userId, operation) =>
      operation(() => {
        if (lost) throw new Error("lock lost")
      }),
    fetcher: (async (...args: Parameters<typeof fetch>) => {
      const result = await fetcher(...args)
      lost = true
      return result
    }) as typeof fetch,
  })
  await assert.rejects(
    apple.saveAppleAuthorization(A, "code_a", injected),
    /Couldn't save your Sign in with Apple/
  )
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
})

test("deletion revokes an owned fresh token when its lock is lost during exchange", async () => {
  let lost = false
  const injected = deps({
    fetcher: (async (...args: Parameters<typeof fetch>) => {
      const result = await fetcher(...args)
      lost = true
      return result
    }) as typeof fetch,
  })
  await assert.rejects(
    apple.revokeAppleSignIn(A, "code_a", injected, () => {
      if (lost) throw new Error("lock lost")
    }),
    /Couldn't revoke Sign in with Apple/
  )
  assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
})

test("authorization service boundaries reject malformed codes before side effects", async () => {
  const account = await import("../services/account")
  let touched = false
  const injected = deps({
    withAccountLock: async () => {
      touched = true
      throw new Error("unexpected lock")
    },
  })
  for (const code of ["", "  ", "x".repeat(4097), 12, null, {}]) {
    await assert.rejects(apple.saveAppleAuthorization(A, code, injected), {
      name: "ZodError",
    })
    await assert.rejects(apple.revokeAppleSignIn(A, code, injected), {
      name: "ZodError",
    })
  }
  const steps = {
    ...deletionSteps(deps()),
    cancelSubscriptions: async () => {
      touched = true
    },
  }
  for (const code of ["", "  ", "x".repeat(4097)])
    await assert.rejects(
      account.deleteAccount(A, steps, { appleAuthorizationCode: code }),
      { name: "ZodError" }
    )
  assert.equal(touched, false)
  assert.deepEqual(apple_.exchanged, [])
})

test("authorization service trims a valid code before exchange", async () => {
  await apple.saveAppleAuthorization(A, "  code_a  ", deps())
  assert.deepEqual(apple_.exchanged, ["code_a"])
})

for (const failedStep of ["deleteComputer", "deleteUser"] as const) {
  test(`${failedStep} failure retains revocation evidence for a code-free deletion retry`, async () => {
    const account = await import("../services/account")
    await apple.saveAppleAuthorization(A, "code_a", deps())
    const injected = deps()
    const steps = deletionSteps(injected)
    await assert.rejects(
      account.deleteAccount(A, {
        ...steps,
        [failedStep]: async () => {
          throw new Error("provider unavailable")
        },
      }),
      /provider unavailable/
    )
    assert.equal((await db.select().from(schema.appleSignInGrants)).length, 1)
    assert.deepEqual(await account.deleteAccount(A, steps), {
      appleSignIn: "revoked",
    })
    assert.deepEqual(apple_.revoked, [
      "refresh_for_code_a",
      "refresh_for_code_a",
      "refresh_for_code_a",
    ])
    assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
  })
}

test("post-Clerk grant cleanup retries immediately and removes the final grant", async () => {
  const account = await import("../services/account")
  await apple.saveAppleAuthorization(A, "code_a", deps())
  let attempts = 0
  await account.deleteAccount(A, {
    ...deletionSteps(deps()),
    deleteAppleGrants: async (userId) => {
      assert.equal(linked.has(userId), false)
      if (++attempts < 3) throw new Error("database unavailable")
      await db
        .delete(schema.appleSignInGrants)
        .where(eq(schema.appleSignInGrants.userId, userId))
    },
  })
  assert.equal(attempts, 3)
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
})

test("exhausted post-Clerk cleanup reports failure with the encrypted grant retained", async () => {
  const account = await import("../services/account")
  await apple.saveAppleAuthorization(A, "code_a", deps())
  let attempts = 0
  await assert.rejects(
    account.deleteAccount(A, {
      ...deletionSteps(deps()),
      deleteAppleGrants: async () => {
        attempts++
        throw new Error("database unavailable")
      },
    }),
    /database unavailable/
  )
  assert.equal(attempts, 3)
  assert.equal(linked.has(A), false)
  assert.equal((await db.select().from(schema.appleSignInGrants)).length, 1)
})

for (const operation of ["save", "deletion"] as const) {
  for (const compensationOutage of [false, true]) {
    test(`${operation} compensates a rejected grant upsert once (revoke outage: ${compensationOutage})`, async () => {
      // Fail a real database insert after Apple has issued the refresh token.
      // The driver error intentionally contains fake token-like text, which
      // must never escape through the service error or telemetry.
      await database.pool
        .query(`CREATE FUNCTION reject_apple_grant() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'fake_refresh_secret_in_database_error'; END $$`)
      await database.pool
        .query(`CREATE TRIGGER reject_apple_grant BEFORE INSERT OR UPDATE ON apple_sign_in_grants
        FOR EACH ROW EXECUTE FUNCTION reject_apple_grant()`)
      let revokeAttempts = 0
      const injected = deps({
        fetcher: (async (...args: Parameters<typeof fetch>) => {
          if (String(args[0]).endsWith("/auth/revoke")) revokeAttempts++
          return fetcher(...args)
        }) as typeof fetch,
      })
      apple_.revokeMode = compensationOutage ? "outage" : "ok"
      try {
        const expected =
          operation === "save"
            ? apple.APPLE_SAVE_ERROR
            : apple.APPLE_REVOKE_ERROR
        await assert.rejects(
          operation === "save"
            ? apple.saveAppleAuthorization(A, "code_a", injected)
            : apple.revokeAppleSignIn(A, "code_a", injected),
          (error: unknown) =>
            error instanceof Error &&
            error.message === expected &&
            error.cause === undefined
        )
        assert.equal(revokeAttempts, 1)
        assert.deepEqual(
          apple_.revoked,
          compensationOutage ? [] : ["refresh_for_code_a"]
        )
        assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
      } finally {
        await database.pool.query(
          "DROP TRIGGER reject_apple_grant ON apple_sign_in_grants"
        )
        await database.pool.query("DROP FUNCTION reject_apple_grant()")
      }
    })
  }
}

for (const operation of ["save", "deletion"] as const) {
  test(`${operation} compensates detected lock loss during a committed upsert once`, async () => {
    let guards = 0
    let armed = false
    let lost = false
    let revokeAttempts = 0
    const assertHeld = () => {
      // Both callers check before exchange and immediately before persistence.
      // Arm the real pool release event for the upcoming successful DB write.
      if (++guards === 2) armed = true
      if (lost) throw new Error("lock connection lost during upsert")
    }
    const released = () => {
      if (armed) lost = true
    }
    database.pool.on("release", released)
    const injected = deps({
      withAccountLock: async (_userId, body) => body(assertHeld),
      fetcher: (async (...args: Parameters<typeof fetch>) => {
        if (String(args[0]).endsWith("/auth/revoke")) revokeAttempts++
        return fetcher(...args)
      }) as typeof fetch,
    })
    try {
      const expected =
        operation === "save" ? apple.APPLE_SAVE_ERROR : apple.APPLE_REVOKE_ERROR
      await assert.rejects(
        operation === "save"
          ? apple.saveAppleAuthorization(A, "code_a", injected)
          : apple.revokeAppleSignIn(A, "code_a", injected, assertHeld),
        (error: unknown) => error instanceof Error && error.message === expected
      )
    } finally {
      database.pool.removeListener("release", released)
    }
    assert.equal(lost, true)
    assert.equal(guards, 3)
    assert.equal(revokeAttempts, 1)
    assert.deepEqual(apple_.revoked, ["refresh_for_code_a"])
    const rows = await db.select().from(schema.appleSignInGrants)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].userId, A)
    // The write committed before the post-await guard rejected the operation.
    assert.equal(
      lib.decryptAppleRefreshToken(
        rows[0].refreshToken,
        A,
        CLIENT,
        Buffer.from(env.APPLE_SIWA_TOKEN_ENCRYPTION_KEY, "hex")
      ),
      "refresh_for_code_a"
    )
  })
}

test("fresh post-Clerk lease sweeps a grant saved while the original deletion lease was lost", async () => {
  const account = await import("../services/account")
  let tail = Promise.resolve()
  let current: { lost: boolean; release: () => void } | undefined
  let acquisitions = 0
  const withAccountLock: AppleDeps["withAccountLock"] = async (
    _userId,
    body
  ) => {
    const prior = tail
    const done = gate()
    tail = done.promise
    await prior
    const lease = { lost: false, release: done.release }
    current = lease
    acquisitions++
    try {
      return await body(() => {
        if (lease.lost) throw new Error("old lease lost")
      })
    } finally {
      done.release()
    }
  }
  const injected = deps({ withAccountLock })
  await apple.saveAppleAuthorization(A, "code_a", injected)
  acquisitions = 0
  const deletingUser = gate()
  const finishDeleting = gate()
  const deleting = account.deleteAccount(A, {
    ...deletionSteps(injected),
    deleteUser: async () => {
      deletingUser.release()
      await finishDeleting.promise
      linked.delete(A)
    },
  })
  await deletingUser.promise
  current!.lost = true
  current!.release()
  await apple.saveAppleAuthorization(A, "code_a2", injected)
  finishDeleting.release()
  assert.deepEqual(await deleting, { appleSignIn: "revoked" })
  assert.equal(acquisitions, 3)
  assert.deepEqual(apple_.revoked, [
    "refresh_for_code_a",
    "refresh_for_code_a2",
  ])
  assert.deepEqual(await db.select().from(schema.appleSignInGrants), [])
})

test("post-Clerk cleanup retries use fresh released leases and preserve manual outcome", async () => {
  const account = await import("../services/account")
  let held = false
  let acquisitions = 0
  let deletes = 0
  let revokes = 0
  const injected = deps({
    withAccountLock: async (_userId, body) => {
      assert.equal(
        held,
        false,
        "previous lease must be released before reacquiring"
      )
      held = true
      acquisitions++
      try {
        return await body(() => assert.equal(held, true))
      } finally {
        held = false
      }
    },
  })
  const result = await account.deleteAccount(A, {
    ...deletionSteps(injected),
    revokeApple: async () => (++revokes === 1 ? "manual" : "none"),
    deleteAppleGrants: async () => {
      if (++deletes < 3) throw new Error("retry cleanup")
    },
  })
  assert.deepEqual(result, { appleSignIn: "manual" })
  assert.equal(acquisitions, 4)
  assert.equal(revokes, 4)
  assert.equal(held, false)
})

test("a transient post-Clerk Apple failure retains grants and never reports deletion success", async () => {
  const account = await import("../services/account")
  await apple.saveAppleAuthorization(A, "code_a", deps())
  const injected = deps()
  await assert.rejects(
    account.deleteAccount(A, {
      ...deletionSteps(injected),
      deleteUser: async () => {
        linked.delete(A)
        apple_.revokeMode = "outage"
      },
    }),
    /Couldn't revoke/
  )
  assert.equal((await db.select().from(schema.appleSignInGrants)).length, 1)
})

test("Clerk timeout is accepted only after a lookup confirms user absence", async () => {
  const { deleteClerkUser } = await import("../services/account")
  await deleteClerkUser(A, {
    deleteUser: async () => {
      throw new Error("timeout")
    },
    getUser: async () => {
      throw Object.assign(new Error("not found"), { status: 404 })
    },
  })
  for (const getUser of [
    async () => ({}),
    async () => {
      throw new Error("lookup unavailable")
    },
  ]) {
    await assert.rejects(
      deleteClerkUser(A, {
        deleteUser: async () => {
          throw new Error("timeout with private details")
        },
        getUser,
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Couldn't delete your account. Try again."
    )
  }
})

test("manual sweep outcome survives committed cleanup followed by lock loss and empty retry", async () => {
  const account = await import("../services/account")
  let revokes = 0
  let sweeps = 0
  let leaseLost = false
  const injected = deps({
    withAccountLock: async (_userId, body) => {
      leaseLost = false
      return body(() => {
        if (leaseLost) throw new Error("lease lost after cleanup commit")
      })
    },
  })
  const result = await account.deleteAccount(A, {
    ...deletionSteps(injected),
    revokeApple: async () =>
      ++revokes === 1 ? "revoked" : revokes === 2 ? "manual" : "none",
    deleteAppleGrants: async () => {
      if (++sweeps === 1) leaseLost = true
    },
  })
  assert.deepEqual(result, { appleSignIn: "manual" })
  assert.equal(revokes, 3)
})
