import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { Sandbox } from "@e2b/desktop"
import { eq } from "drizzle-orm"
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
} from "@/lib/e2b"
import { createSandboxTools } from "@/lib/sandbox-tools"

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

const directory = ".artifacts/e2b"
await mkdir(directory, { recursive: true })
const botId = `verify-${randomUUID()}`
const userId = `verify-${randomUUID()}`
const sandboxId = await createBotSandbox(botId)
const tools = createSandboxTools(() => sandboxId)
const options = { toolCallId: "verification", messages: [], context: {} }
const report: Record<string, unknown> = {
  sandboxId,
  checkedAt: new Date().toISOString(),
}
const note = "E2B verification: retain this memory after pause and resume."
const content = `files survive ${botId}`
try {
  await db
    .insert(bots)
    .values({
      id: botId,
      userId,
      name: "Verification",
      job: "Verify E2B",
      sandboxId,
    })
  assert.equal((await Sandbox.getInfo(sandboxId)).state, "paused")
  await result(
    tools.writeFile.execute!(
      { path: "verification/note.txt", content },
      options
    )
  )
  await result(tools.remember.execute!({ note }, options))
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
  assert.match(
    (await result(tools.recall.execute!({}, options))).memory,
    /retain this memory/
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
  assert.match(
    (await result(tools.recall.execute!({}, options))).memory,
    /retain this memory/
  )
  const files = await result(
    tools.listFiles.execute!({ path: "verification" }, options)
  )
  assert.ok(files.files.some((file) => file.name === "note.txt"))
  report.explicitPauseResume = true
  report.idlePauseResume = true
  report.filesAndMemoryIntact = true
  report.meteringRetriesIdempotent = true
  report.nonzeroCommandsPreserved = true
} finally {
  await deleteBotSandbox(sandboxId)
  await deleteBotSandbox(sandboxId)
  await db.delete(bots).where(eq(bots.id, botId))
  await db.delete(usageEntries).where(eq(usageEntries.userId, userId))
}
report.deleted = true
await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(0)
