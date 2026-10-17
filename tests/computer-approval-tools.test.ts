import assert from "node:assert/strict"
import test from "node:test"

import type { Sandbox } from "@e2b/desktop"

import {
  createComputerApprovalTools,
  createComputerGate,
  type ComputerApprovalStore,
} from "../lib/computer-approval-tools"
import {
  DECLINED_ERROR,
  GUARD_EXHAUSTED_ERROR,
  GUARD_UNAVAILABLE_ERROR,
  guardVerdict,
  NOTHING_HELD_ERROR,
  type ComputerGesture,
  type DeclinedAction,
  type GuardOutput,
} from "../lib/computer-approval-policy"

const sandbox = {} as Sandbox
const ctx = { toolCallId: "call_1" }
const click: ComputerGesture = {
  tool: "mouseClick",
  x: 500,
  y: 400,
  button: "left",
  double: false,
}
const high = (patch: Partial<GuardOutput> = {}) =>
  guardVerdict({
    target: "Send",
    impact: "high",
    category: "send",
    confidence: "high",
    injection: false,
    hostname: "mail.example.com",
    reason: "Send button",
    ...patch,
  })
const none = guardVerdict({
  target: "Link",
  impact: "none",
  category: "none",
  confidence: "high",
  injection: false,
  hostname: null,
  reason: "",
})

type Row = {
  state: string
  action: string | null
  hostname: string | null
  claimedAt: Date | null
  uses: number
  command?: string | null
}

// An in-memory store with the same rules as lib/approvals.ts
function memoryStore(rows: Record<string, Row> = {}) {
  const completed: { id: string; ok: boolean }[] = []
  const requested: unknown[] = []
  const store: ComputerApprovalStore = {
    request: async (input) => {
      requested.push(input)
      return { approvalId: "apr_new", summary: input.summary }
    },
    read: async (id) => rows[id],
    spend: async (id, options) => {
      const row = rows[id]
      if (!row) return false
      if (options?.once && row.state !== "approved") return false
      if (row.state === "approved") {
        Object.assign(row, { state: "running", claimedAt: new Date(), uses: 1 })
        return true
      }
      if (
        (row.state === "running" || row.state === "executed") &&
        row.claimedAt &&
        Date.now() - row.claimedAt.getTime() <= 90_000 &&
        row.uses < 3
      ) {
        row.uses++
        return true
      }
      return false
    },
    complete: async (id, outcome) => {
      completed.push({ id, ok: outcome.ok })
      const row = rows[id]
      if (row)
        row.state = outcome.ok
          ? "executed"
          : row.state === "executed"
            ? "executed"
            : "failed"
    },
  }
  return { store, completed, requested, rows }
}

function gate(
  options: {
    verdicts?: (ReturnType<typeof high> | Error)[]
    rows?: Record<string, Row>
    declined?: DeclinedAction[]
    canCheck?: () => boolean
  } = {}
) {
  const memory = memoryStore(options.rows)
  const seen: unknown[] = []
  let shots = 0
  const verdicts = [...(options.verdicts ?? [])]
  const g = createComputerGate({
    store: memory.store,
    takeScreenshot: async () => ({
      base64: `shot${shots++}`,
      mediaType: "image/png",
      width: 1024,
      height: 768,
    }),
    check: async (input) => {
      seen.push(input)
      const next = verdicts.shift() ?? none
      if (next instanceof Error) throw next
      return next
    },
    declined: () => options.declined ?? [],
    canCheck: options.canCheck,
  })
  return { gate: g, seen, ...memory }
}

test("a committing click without approval is refused before it runs", async () => {
  const { gate: g } = gate({ verdicts: [high()] })
  await assert.rejects(
    g.gesture(sandbox, click, undefined, ctx),
    /Approval required.*requestComputerApproval with action "send"/
  )
})

test("a non-committing click passes and spends nothing", async () => {
  const { gate: g, rows } = gate({
    verdicts: [none],
    rows: {
      apr_1: {
        state: "approved",
        action: "send",
        hostname: null,
        claimedAt: null,
        uses: 0,
      },
    },
  })
  const result = await g.gesture(sandbox, click, "apr_1", ctx)
  assert.equal(result.claimed, undefined)
  assert.equal(rows.apr_1.state, "approved")
})

test("the guard never sees the bot's own words", async () => {
  const { gate: g, seen } = gate({ verdicts: [none] })
  await g.gesture(sandbox, click, undefined, ctx)
  const input = seen[0] as Record<string, unknown>
  assert.deepEqual(Object.keys(input).sort(), [
    "gesture",
    "screenshot",
    "signal",
    "toolCallId",
    "windowTitle",
  ])
})

test("guard failures fail closed, and three in a row stop the turn's gestures", async () => {
  const { gate: g, seen } = gate({
    verdicts: [new Error("down"), new Error("down"), new Error("down"), none],
  })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), {
    message: GUARD_UNAVAILABLE_ERROR,
  })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), {
    message: GUARD_UNAVAILABLE_ERROR,
  })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), {
    message: GUARD_EXHAUSTED_ERROR,
  })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), {
    message: GUARD_EXHAUSTED_ERROR,
  })
  assert.equal(seen.length, 3)
})

test("no allowance or budget for the check means no committing gesture", async () => {
  const { gate: g, seen } = gate({ canCheck: () => false })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), {
    message: GUARD_EXHAUSTED_ERROR,
  })
  assert.equal(seen.length, 0)
})

test("an approval is spent for its own kind of action and site, within its window", async () => {
  const rows = {
    apr_1: {
      state: "approved",
      action: "send",
      hostname: "mail.example.com",
      claimedAt: null,
      uses: 0,
    },
  }
  const { gate: g } = gate({
    verdicts: [high({ category: "payment" }), high(), high(), high(), high()],
    rows,
  })
  // A send approval can't pay
  await assert.rejects(
    g.gesture(sandbox, click, "apr_1", ctx),
    /isn't an approved request/
  )
  assert.equal(rows.apr_1.state, "approved")
  // Three steps (send, then confirm, then one more), then it's used up
  for (let i = 0; i < 3; i++) {
    const { claimed } = await g.gesture(
      sandbox,
      { ...click, x: click.x + i },
      "apr_1",
      ctx
    )
    assert.equal(claimed, "apr_1")
  }
  await assert.rejects(
    g.gesture(sandbox, { ...click, x: 9 }, "apr_1", ctx),
    /isn't an approved request/
  )
})

test("an approval for another site, a pending one or a declined one is refused", async () => {
  const rows: Record<string, Row> = {
    other: {
      state: "approved",
      action: "send",
      hostname: "evil.example",
      claimedAt: null,
      uses: 0,
    },
    pending: {
      state: "pending",
      action: "send",
      hostname: null,
      claimedAt: null,
      uses: 0,
    },
    denied: {
      state: "denied",
      action: "send",
      hostname: null,
      claimedAt: null,
      uses: 0,
    },
    stale: {
      state: "executed",
      action: "send",
      hostname: null,
      claimedAt: new Date(Date.now() - 120_000),
      uses: 1,
    },
  }
  const { gate: g } = gate({
    verdicts: [high(), high(), high(), high(), high()],
    rows,
  })
  for (const id of ["other", "pending", "denied", "stale", "missing"])
    await assert.rejects(
      g.gesture(sandbox, { ...click, y: id.length }, id, ctx),
      /isn't an approved request/,
      id
    )
})

test("after a decline, the same kind of step is refused and can't be asked again", async () => {
  const declined: DeclinedAction[] = [
    { kind: "computer", action: "send", hostname: null },
  ]
  const { gate: g } = gate({
    verdicts: [high()],
    declined,
    rows: {
      apr_1: {
        state: "approved",
        action: "send",
        hostname: null,
        claimedAt: null,
        uses: 0,
      },
    },
  })
  await assert.rejects(g.gesture(sandbox, click, "apr_1", ctx), {
    message: DECLINED_ERROR,
  })
  await assert.rejects(g.shell("echo hi | sendmail a@b.c", undefined), {
    message: DECLINED_ERROR,
  })
  const { store } = memoryStore()
  const tools = createComputerApprovalTools(store, {
    gate: g,
    screenViewed: () => true,
    declined: () => declined,
  })
  await assert.rejects(
    Promise.resolve(
      tools.requestComputerApproval.execute!(
        { action: "send", summary: "Send it", hostname: "mail.example.com" },
        { toolCallId: "t", messages: [], context: {} }
      )
    ),
    { message: DECLINED_ERROR }
  )
})

test("a declined kind of step can't be asked again under another label", async () => {
  const declined: DeclinedAction[] = [
    { kind: "computer", action: "buy", hostname: null },
  ]
  // Held before the decline was known, say from an earlier message
  const {
    gate: g,
    store,
    requested,
  } = gate({
    verdicts: [high({ category: "payment" })],
  })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), /"buy"/)
  const tools = createComputerApprovalTools(store, {
    gate: g,
    screenViewed: () => true,
    declined: () => declined,
  })
  await assert.rejects(
    Promise.resolve(
      tools.requestComputerApproval.execute!(
        { action: "submit", summary: "Submit it", hostname: "shop.example" },
        { toolCallId: "t", messages: [], context: {} }
      )
    ),
    { message: DECLINED_ERROR }
  )
  assert.equal(requested.length, 0)
})

test("a retried step on an unchanged screen is checked once", async () => {
  let checks = 0
  const { store } = memoryStore()
  const g = createComputerGate({
    store,
    takeScreenshot: async () => ({
      base64: "same",
      mediaType: "image/png",
      width: 1,
      height: 1,
    }),
    check: async () => {
      checks++
      return none
    },
  })
  await g.gesture(sandbox, click, undefined, ctx)
  await g.gesture(sandbox, click, undefined, ctx)
  assert.equal(checks, 1)
})

test("the shell: refused commands never run, held ones need the exact approved command", async () => {
  const rows: Record<string, Row> = {
    apr_push: {
      state: "approved",
      action: "post",
      hostname: "github.com",
      claimedAt: null,
      uses: 0,
      command: "git push origin main",
    },
  }
  const { gate: g } = gate({ rows })
  await assert.rejects(g.shell("xdotool click 1", undefined), /isn't allowed/)
  await assert.rejects(g.shell("xdotool click 1", "apr_push"), /isn't allowed/)
  await assert.rejects(
    g.shell("git push origin main", undefined),
    /Approval required/
  )
  // A different command under the same approval
  await assert.rejects(
    g.shell("git push --force origin main", "apr_push"),
    /isn't an approved request/
  )
  assert.deepEqual(await g.shell("git push origin main", "apr_push"), {
    claimed: "apr_push",
  })
  assert.deepEqual(await g.shell("ls", undefined), {})
})

test("asking for approval needs a look at the screen first and stores the server's screenshot", async () => {
  const {
    gate: g,
    store,
    requested,
  } = gate({
    verdicts: [high({ category: "grades", hostname: null })],
  })
  let viewed = false
  const tools = createComputerApprovalTools(store, {
    gate: g,
    screenViewed: () => viewed,
    preview: async () => ({
      base64: "abc",
      mediaType: "image/png",
      width: 1,
      height: 1,
    }),
  })
  const run = (input: Record<string, unknown>) =>
    Promise.resolve(
      tools.requestComputerApproval.execute!(input as never, {
        toolCallId: "t",
        messages: [],
        context: {},
      })
    )
  // Nothing was held yet
  await assert.rejects(
    run({
      action: "submit",
      summary: "Submit grades",
      hostname: "school.example.com",
    }),
    { message: NOTHING_HELD_ERROR }
  )
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), /"submit"/)
  await assert.rejects(
    run({
      action: "submit",
      summary: "Submit grades",
      hostname: "school.example.com",
    }),
    /viewScreen first/
  )
  viewed = true
  const held = await run({
    action: "submit",
    summary: "Submit grades",
    hostname: "school.example.com",
  })
  assert.equal((held as { status: string }).status, "approval_required")
  assert.equal(
    (requested[0] as { preview: string }).preview,
    "data:image/png;base64,abc"
  )
  // No address bar in view: the bot's hostname is kept, and the window title
  // must name it when the approval is spent
  assert.equal(
    (requested[0] as { hostname: string }).hostname,
    "school.example.com"
  )
  // A model can't name its own hostname with a scheme or path
  await assert.rejects(
    run({ action: "submit", summary: "x", hostname: "https://evil/x" })
  )
})

test("a shell approval runs its command once, with its data inline", async () => {
  const rows: Record<string, Row> = {
    apr_post: {
      state: "approved",
      action: "submit",
      hostname: "shop.example.com",
      claimedAt: null,
      uses: 0,
      command: "curl -X POST https://shop.example.com/orders -d '{\"sku\":1}'",
    },
  }
  const { gate: g } = gate({ rows })
  const command = rows.apr_post.command!
  assert.deepEqual(await g.shell(command, "apr_post"), { claimed: "apr_post" })
  await assert.rejects(
    g.shell(command, "apr_post"),
    /isn't an approved request/
  )
  await assert.rejects(
    g.shell(
      "curl -X POST https://shop.example.com/orders -d @order.json",
      undefined
    ),
    /inline in the command/
  )
  await assert.rejects(
    g.shell(
      "curl -X POST https://x.example.com --data-binary @- < order.json",
      undefined
    ),
    /inline in the command/
  )
})

test("account security and terminal commands on the desktop are never approved", async () => {
  const rows: Record<string, Row> = {
    apr_1: {
      state: "approved",
      action: "submit",
      hostname: null,
      claimedAt: null,
      uses: 0,
    },
  }
  const { gate: g } = gate({
    verdicts: [
      high({ category: "account" }),
      high({ category: "run_command" }),
    ],
    rows,
  })
  await assert.rejects(
    g.gesture(sandbox, click, "apr_1", ctx),
    /which bots don't do/
  )
  await assert.rejects(
    g.gesture(sandbox, { ...click, x: 1 }, "apr_1", ctx),
    /which bots don't do/
  )
  assert.equal(rows.apr_1.state, "approved")
})

test("one approval use is one Enter", async () => {
  const rows: Record<string, Row> = {
    apr_1: {
      state: "approved",
      action: "send",
      hostname: null,
      claimedAt: null,
      uses: 0,
    },
  }
  const { gate: g } = gate({ verdicts: [high()], rows })
  await assert.rejects(
    g.gesture(
      sandbox,
      { tool: "keyboardType", text: "hi\nhi again\n" },
      "apr_1",
      ctx
    ),
    /more than once/
  )
  assert.equal(rows.apr_1.state, "approved")
})

test("without an address bar in view, the window must name the approved site", async () => {
  const rows: Record<string, Row> = {
    apr_1: {
      state: "approved",
      action: "send",
      hostname: "mail.example.com",
      claimedAt: null,
      uses: 0,
    },
  }
  const { store } = memoryStore(rows)
  const titles = ["Inbox - Other Mail", "Inbox - Example Mail"]
  const g = createComputerGate({
    store,
    takeScreenshot: async () => ({
      base64: String(Math.random()),
      mediaType: "image/png",
      width: 1,
      height: 1,
    }),
    windowTitle: async () => titles.shift(),
    check: async () => high({ hostname: null }),
  })
  await assert.rejects(
    g.gesture(sandbox, click, "apr_1", ctx),
    /isn't an approved request/
  )
  assert.equal((await g.gesture(sandbox, click, "apr_1", ctx)).claimed, "apr_1")
})

// #33: the bot labelled a pizza "Submit order" click "submit", the guard
// classified it as a purchase, and the approved step could never be spent
test("an approval is bound to the guard's action and site, not the bot's label, and then spends once", async () => {
  const purchase = high({
    target: "Submit order",
    category: "purchase",
    hostname: "httpbin.org",
    reason: "Places a pizza order",
  })
  // Turn 1: the click is held, and the bot asks with its own word
  const first = gate({ verdicts: [purchase] })
  await assert.rejects(
    first.gate.gesture(sandbox, click, undefined, ctx),
    /action "buy"/
  )
  const tools = createComputerApprovalTools(first.store, {
    gate: first.gate,
    screenViewed: () => true,
    preview: async () => ({
      base64: "abc",
      mediaType: "image/png",
      width: 1,
      height: 1,
    }),
  })
  const held = await tools.requestComputerApproval.execute!(
    {
      action: "submit",
      summary: "Submit the httpbin pizza order form",
      hostname: "httpbin.org",
      // Prose in place of a command, as in the B12 run
      command:
        "Click the Submit order button on https://httpbin.org/forms/post",
    },
    { toolCallId: "t", messages: [], context: {} }
  )
  assert.equal((held as { action: string }).action, "buy")
  const stored = first.requested[0] as Record<string, unknown>
  // The owner's card says Buy, shows the server's screenshot and no command
  assert.equal(stored.action, "buy")
  assert.equal(stored.hostname, "httpbin.org")
  assert.equal(stored.preview, "data:image/png;base64,abc")
  assert.equal(stored.command, undefined)

  // The owner approves; turn 2 repeats the click with the approvalId
  const rows: Record<string, Row> = {
    apr_new: {
      state: "approved",
      action: stored.action as string,
      hostname: stored.hostname as string,
      claimedAt: null,
      uses: 0,
    },
  }
  const second = gate({ verdicts: [purchase], rows })
  const { claimed } = await second.gate.gesture(sandbox, click, "apr_new", ctx)
  assert.equal(claimed, "apr_new")
  assert.equal(rows.apr_new.state, "running")
  assert.equal(rows.apr_new.uses, 1)
})

test("a command approval holds only a command the shell held, with the shell's action", async () => {
  const { gate: g, store, requested } = gate()
  const tools = createComputerApprovalTools(store, {
    gate: g,
    screenViewed: () => false,
    preview: async () => {
      throw new Error("no screenshot for a command")
    },
  })
  const run = (input: Record<string, unknown>) =>
    Promise.resolve(
      tools.requestComputerApproval.execute!(input as never, {
        toolCallId: "t",
        messages: [],
        context: {},
      })
    )
  const push = {
    action: "send",
    summary: "Push main to GitHub",
    hostname: "github.com",
    command: "git push origin main",
  }
  // The shell never refused this command, so there's nothing to approve
  await assert.rejects(run(push), { message: NOTHING_HELD_ERROR })
  await assert.rejects(g.shell(push.command, undefined), /Approval required/)
  await run(push)
  // Stored as the shell's "post", so the command can be spent once
  const stored = requested[0] as Record<string, unknown>
  assert.equal(stored.action, "post")
  assert.equal(stored.command, push.command)
  assert.equal(stored.preview, undefined)
  const rows: Record<string, Row> = {
    apr_new: {
      state: "approved",
      action: stored.action as string,
      hostname: stored.hostname as string,
      claimedAt: null,
      uses: 0,
      command: stored.command as string,
    },
  }
  const next = gate({ rows })
  assert.deepEqual(await next.gate.shell(push.command, "apr_new"), {
    claimed: "apr_new",
  })
})

test("the guard's hostname is the approved site when it read one", async () => {
  const {
    gate: g,
    store,
    requested,
  } = gate({
    verdicts: [high({ hostname: "mail.example.com" })],
  })
  await assert.rejects(g.gesture(sandbox, click, undefined, ctx), /"send"/)
  const tools = createComputerApprovalTools(store, {
    gate: g,
    screenViewed: () => true,
  })
  await tools.requestComputerApproval.execute!(
    { action: "send", summary: "Send the reply", hostname: "example.com" },
    { toolCallId: "t", messages: [], context: {} }
  )
  assert.equal(
    (requested[0] as { hostname: string }).hostname,
    "mail.example.com"
  )
})

test("an approval that doesn't cover the step leaves it held for a new request", async () => {
  const rows: Record<string, Row> = {
    apr_send: {
      state: "approved",
      action: "send",
      hostname: null,
      claimedAt: null,
      uses: 0,
    },
  }
  const { gate: g } = gate({
    verdicts: [high({ category: "purchase" })],
    rows,
  })
  await assert.rejects(
    g.gesture(sandbox, click, "apr_send", ctx),
    /isn't an approved request/
  )
  assert.equal(rows.apr_send.state, "approved")
  assert.equal(g.heldGesture()?.action, "buy")
})
