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
  const { store, requested } = memoryStore()
  let viewed = false
  const tools = createComputerApprovalTools(store, {
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
