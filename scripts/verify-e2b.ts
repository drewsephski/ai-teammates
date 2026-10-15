import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { mock } from "node:test"
import { Sandbox, type SandboxOpts } from "@e2b/desktop"
import { eq, sql } from "drizzle-orm"
import { WebSocket } from "ws"

import { db } from "@/db"
import { bots, usageEntries } from "@/db/schema"
import {
  createBotSandbox,
  deleteBotSandbox,
  getBotDesktopConnection,
  meterBotSandbox,
  pauseBotSandbox,
  withBotSandbox,
  renewBotDesktop,
  resetBotSandbox,
} from "@/lib/e2b"
import { createSandboxTools } from "@/lib/sandbox-tools"
import { SandboxMissingError } from "@/lib/sandbox-lifecycle"
import { withSandboxLock, tryWithSandboxLock } from "@/lib/sandbox-lock"

function isStream<T>(value: T | AsyncIterable<T>): value is AsyncIterable<T> {
  return (
    typeof value === "object" && value !== null && Symbol.asyncIterator in value
  )
}

async function result<T>(
  value: T | AsyncIterable<T> | PromiseLike<T | AsyncIterable<T>>
): Promise<T> {
  const output = await value
  if (isStream(output))
    throw new Error("Verification expected a completed tool result")
  return output
}

const directory = process.argv[2] ?? ".artifacts/e2b"
// Production's scheduled meter must never pause a temporary verification VM
// before the fixture row exists. All provider operations still execute for real.
const originalCreate: (
  this: typeof Sandbox,
  options: SandboxOpts
) => Promise<Sandbox> = Sandbox.create
const createSandbox = originalCreate.bind(Sandbox)
mock.method(Sandbox, "create", (options: SandboxOpts) =>
  createSandbox({
    ...options,
    metadata: { ...options.metadata, app: "ai-teammates-verification" },
  })
)
await mkdir(directory, { recursive: true })
const botId = `verify-${randomUUID()}`
const userId = `verify-${randomUUID()}`
let sandboxId = await createBotSandbox(botId)
const createdIds = new Set([sandboxId])
const tools = createSandboxTools(() => sandboxId)
const options = { toolCallId: "verification", messages: [], context: {} }
const report: Record<string, unknown> = {
  sandboxId,
  checkedAt: new Date().toISOString(),
}
const content = `files survive ${botId}`
try {
  await db.insert(bots).values({
    id: botId,
    userId,
    name: "Verification",
    job: "Verify E2B",
    sandboxId,
  })
  assert.equal((await Sandbox.getInfo(sandboxId)).state, "paused")
  const lockFailure = new Error("intentional lock failure")
  await assert.rejects(
    withSandboxLock(sandboxId, async () => {
      assert.deepEqual(await tryWithSandboxLock(sandboxId, async () => {}), {
        acquired: false,
      })
      const activity = await db.execute(
        sql`select count(*)::int as count from pg_stat_activity where application_name = 'ai-teammates-sandbox-lock' and state = 'idle in transaction'`
      )
      assert.equal(activity.rows[0].count, 0)
      throw lockFailure
    }),
    (error) => error === lockFailure
  )
  assert.equal(
    (await tryWithSandboxLock(sandboxId, async () => true)).acquired,
    true
  )
  report.locksReleaseOnError = true
  report.noLongDatabaseTransactions = true
  await result(
    tools.writeFile.execute!(
      { path: "verification/note.txt", content },
      options
    )
  )
  const failed = await result(
    tools.bash.execute!(
      { command: "printf expected-error >&2; exit 7", timeout: 60 },
      options
    )
  )
  assert.equal(failed.exitCode, 7)
  assert.match(failed.output, /expected-error/)
  await withBotSandbox(sandboxId, (sandbox) =>
    sandbox.open("https://drewsepeczi.xyz")
  )
  // Wait for the actual browser to render; no HTML is substituted for the screen.
  await new Promise((resolve) => setTimeout(resolve, 6000))
  const before = await result(tools.viewScreen.execute!({}, options))
  await writeFile(
    `${directory}/website.png`,
    Buffer.from(before.base64, "base64")
  )
  report.screen = {
    width: before.width,
    height: before.height,
    mediaType: before.mediaType,
  }
  console.log("Real browser screenshot saved")
  await result(
    tools.mouseClick.execute!(
      { x: 320, y: 60, button: "left", double: false },
      options
    )
  )
  await result(
    tools.keyboardPress.execute!({ key: "l", modifiers: ["ctrl"] }, options)
  )
  await result(
    tools.keyboardType.execute!(
      { text: "https://drewsepeczi.xyz/?e2b=verified" },
      options
    )
  )
  await result(
    tools.keyboardPress.execute!({ key: "enter", modifiers: [] }, options)
  )
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const after = await result(tools.showScreen.execute!({}, options))
  await writeFile(
    `${directory}/after-input.png`,
    Buffer.from(after.base64, "base64")
  )
  const connection = await getBotDesktopConnection(sandboxId)
  const started = Promise.withResolvers<void>()
  const finish = Promise.withResolvers<void>()
  const activeTool = withBotSandbox(
    sandboxId,
    async () => {
      started.resolve()
      await finish.promise
    },
    630_000
  )
  await Promise.race([started.promise, activeTool])
  try {
    const beforeRenew = await Sandbox.getInfo(sandboxId)
    await renewBotDesktop(sandboxId, connection.startedAt)
    await Promise.all([meterBotSandbox(sandboxId), meterBotSandbox(sandboxId)])
    assert.equal(
      (await Sandbox.getInfo(sandboxId)).endAt.getTime(),
      beforeRenew.endAt.getTime()
    )
    report.desktopDoesNotShortenActiveLease = true
  } finally {
    finish.resolve()
    await activeTool
  }
  const direct = await fetch(
    connection.url.replace("wss:", "https:").replace("/websockify", "/vnc.html")
  )
  assert.equal(direct.status, 403)
  const hello = await new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(connection.url, {
      headers: { "e2b-traffic-access-token": connection.token },
      handshakeTimeout: 10_000,
    })
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error("No VNC greeting"))
    }, 15_000)
    socket.once("message", (bytes) => {
      clearTimeout(timer)
      socket.close()
      resolve(bytes.toString())
    })
    socket.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  assert.match(hello, /^RFB /)
  report.privateStreaming = {
    publicHttpStatus: direct.status,
    authenticatedGreeting: hello.trim(),
  }
  await pauseBotSandbox(sandboxId)
  const paused = await Sandbox.getInfo(sandboxId)
  assert.equal(paused.state, "paused")
  await meterBotSandbox(sandboxId)
  const ledgerBefore = await db
    .select()
    .from(usageEntries)
    .where(eq(usageEntries.userId, userId))
  await meterBotSandbox(sandboxId)
  assert.deepEqual(
    await db.select().from(usageEntries).where(eq(usageEntries.userId, userId)),
    ledgerBefore
  )
  assert.equal(
    (
      await result(
        tools.readFile.execute!({ path: "verification/note.txt" }, options)
      )
    ).content,
    content
  )
  const resumed = await Sandbox.getInfo(sandboxId)
  assert.ok(resumed.startedAt > paused.startedAt)
  const client = await Sandbox.connect(sandboxId)
  await client.setTimeout(3000)
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await Sandbox.getInfo(sandboxId)).state === "paused") break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert.equal((await Sandbox.getInfo(sandboxId)).state, "paused")
  assert.equal(
    (
      await result(
        tools.readFile.execute!({ path: "verification/note.txt" }, options)
      )
    ).content,
    content
  )
  const files = await result(
    tools.listFiles.execute!({ path: "verification" }, options)
  )
  assert.ok(files.files.some((file) => file.name === "note.txt"))
  report.explicitPauseResume = true
  report.idlePauseResume = true
  report.filesIntact = true
  report.meteringRetriesIdempotent = true
  report.nonzeroCommandsPreserved = true
  console.log("Lifecycle checks passed; checking explicit reset")
  await assert.rejects(
    resetBotSandbox(botId, "wrong-owner", sandboxId),
    /Bot not found/
  )
  await assert.rejects(
    resetBotSandbox(botId, userId, sandboxId),
    /still exists/
  )
  const previousId = sandboxId
  await Sandbox.kill(previousId)
  await assert.rejects(
    withBotSandbox(previousId, async () => {}),
    SandboxMissingError
  )
  assert.equal(await meterBotSandbox(previousId), false)
  const replacements = await Promise.all([
    resetBotSandbox(botId, userId, previousId),
    resetBotSandbox(botId, userId, previousId),
  ])
  sandboxId = replacements[0]
  createdIds.add(sandboxId)
  assert.equal(replacements[0], replacements[1])
  assert.notEqual(sandboxId, previousId)
  assert.equal((await Sandbox.getInfo(sandboxId)).state, "paused")
  report.explicitMissingComputerReset = true
  report.concurrentResetsCreateOneComputer = true
} finally {
  try {
    for (const id of createdIds) {
      await deleteBotSandbox(id)
      await deleteBotSandbox(id)
    }
  } finally {
    await db.delete(bots).where(eq(bots.id, botId))
    await db.delete(usageEntries).where(eq(usageEntries.userId, userId))
  }
}
report.deleted = true
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(0)
