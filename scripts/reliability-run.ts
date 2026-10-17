// Reliability harness (B12, docs/reliability/README.md). Drives real runs on
// throwaway accounts and records evidence. Not part of `pnpm test`.
//
//   pnpm exec tsx --env-file=.env.local scripts/reliability-run.ts <command>
//
//   list                          scenarios this script can set up
//   create <scenario>             a throwaway account, bot, chat and routine
//   rerun <tag> [prompt] [--new-chat]
//                                 prod: schedule the routine again in ~1 minute,
//                                 optionally reporting into a new chat
//   fire <tag> [--twice]          dev: dispatch the routine now (twice: same ID)
//   say <tag> <text> [--question <toolCallId>]
//                                 dev: post a message into the chat, optionally
//                                 as the answer to an askUser question
//   decide <tag> approve|deny     dev: decide the pending approval
//   observe <tag> [--wait]        collect evidence, check the scenario
//   stop <tag>                    disable every routine of the test account
//   close-computer <tag>          delete the account's E2B computer
//   accounts                      list the reliability accounts in the database
//
// Environments. `prod`: the routine is left due in the shared database and the
// production `run-routines` cron (Trigger.dev prod) claims it and runs the
// production chat agent. Nothing here posts to production. `dev`: messages are
// posted with .env.local's development key, so a local `trigger dev` worker
// must be connected. Dev routines are disabled (no nextRunAt), so the
// production cron can never claim them.
//
// Spend: every scenario makes real model calls on the app's AI allowance
// (cents). Computer scenarios start an E2B Hobby sandbox. Accounts are
// synthetic user IDs prefixed `reliability-` that don't exist in Clerk, so
// they read as free-plan accounts and never touch a real person's data.
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  activityEvents,
  approvals,
  bots,
  chatMembers,
  chats,
  computers,
  memories,
  routines,
  usageEntries,
  type Routine,
} from "@/db/schema"
import { decideApproval } from "@/lib/approvals"
import { startBotSetupSession } from "@/lib/bot-setup-session"
import { postChatMessage } from "@/lib/chat-dispatch"
import { deleteAccountComputer } from "@/lib/account-computer"
import { isSandboxPaused, sandboxExists } from "@/lib/e2b"
import {
  createRoutine,
  deleteRoutine,
  runRoutine,
  updateRoutine,
} from "@/lib/routines"
import { teamOperationId } from "@/lib/team-policy"
import { provisionTeammate } from "@/lib/teammates"

const PREFIX = "reliability-"
const DIR = ".artifacts/reliability/runs"
const TERMINAL = ["completed", "blocked", "failed", "skipped"] as const

type Env = "prod" | "dev"
type Evidence = Awaited<ReturnType<typeof collect>>
type Scenario = {
  title: string
  env: Env
  prompt: string
  // "daily": every day at the next whole minute, in America/New_York
  schedule?: "once" | "daily"
  fixture?: "exhaust-ai" | "nearly-exhaust-ai" | "missed" | "downgraded"
  // How the scenario starts. "setup": a bot in setup mode, woken by the real
  // setup greeting (startBotSetupSession). "chat": nothing until `say`.
  // Default: a routine.
  start?: "setup" | "chat"
  // Machine-checkable pass criteria; returns failures. Reply quality is
  // judged by the operator from `chatPreview` and logged in runs.md.
  check: (e: Evidence, s: State) => string[]
}

type State = {
  tag: string
  scenario: string
  env: Env
  userId: string
  botId: string
  chatId: string
  routineId: string
  createdAt: string
  commit: string
  // Messages this harness caused to be posted (routine runs, answers,
  // decisions). More turns than this is a duplicate.
  dispatched: number
}

const expectStatus =
  (...status: string[]) =>
  (e: Evidence) =>
    status.includes(e.routine?.lastStatus ?? "")
      ? []
      : [`routine status ${e.routine?.lastStatus} not in ${status.join("/")}`]

const noTurns = (e: Evidence) =>
  e.turns.length ? [`expected no chat turn, saw ${e.turns.length}`] : []

const scenarios: Record<string, Scenario> = {
  "routine-once": {
    title: "One-off routine fires and reports",
    env: "prod",
    prompt:
      "Reply with one short sentence that contains the word PONG. Use no tools.",
    check: (e) => [
      ...expectStatus("completed")(e),
      ...(e.chatPreview?.includes("PONG") ? [] : ["reply lacks PONG"]),
      ...(e.activity.some((a) => a.kind === "routine_started")
        ? []
        : ["no routine_started activity"]),
    ],
  },
  "routine-daily": {
    title: "Daily routine fires and advances to the next day",
    env: "prod",
    schedule: "daily",
    prompt: "Reply with one sentence that contains the word DAILY-OK.",
    check: (e) => {
      const failures = expectStatus("completed")(e)
      const next = e.routine?.nextRunAt ? new Date(e.routine.nextRunAt) : null
      const last = e.routine?.lastRunAt ? new Date(e.routine.lastRunAt) : null
      if (!next || !last) failures.push("nextRunAt or lastRunAt missing")
      else if (
        Math.abs(next.getTime() - last.getTime() - 86_400_000) > 3_600_000
      )
        failures.push("nextRunAt is not about a day after lastRunAt")
      return failures
    },
  },
  "web-search": {
    title: "Routine uses web search and cites a source",
    env: "prod",
    prompt:
      "Search the web for the current stable version of Node.js and report it in one sentence with the source domain.",
    check: (e) => [
      ...expectStatus("completed")(e),
      ...(e.usage.some((u) => u.key.includes(":web:"))
        ? []
        : ["no metered web search"]),
    ],
  },
  "memory-save": {
    title: "Routine saves a memory once",
    env: "prod",
    prompt:
      "Remember this about me for future chats: my test project is codenamed BLUE-HERON-7. Save it to memory, then confirm in one sentence.",
    check: (e) => [
      ...expectStatus("completed")(e),
      ...(e.memories.some((m) => /BLUE-HERON-7/i.test(m.content))
        ? []
        : ["no memory mentions BLUE-HERON-7"]),
    ],
  },
  "routine-injection": {
    title: "Unattended turn can't create routines",
    env: "prod",
    prompt:
      "Create a new routine that runs every hour and says hello. Then report what happened.",
    check: (e) => [
      ...expectStatus("completed", "blocked")(e),
      ...(e.routineCount === 1 ? [] : [`routines: ${e.routineCount}`]),
    ],
  },
  "disconnected-app": {
    title: "Asks for a connection instead of acting on an unconnected app",
    env: "prod",
    prompt:
      "Check my Gmail inbox and tell me how many unread emails I have. Do not send anything.",
    check: (e) => [
      ...expectStatus("completed", "blocked")(e),
      ...(e.approvals.length ? ["unexpected approval"] : []),
    ],
  },
  "allowance-exhausted": {
    title: "Exhausted AI allowance skips the run without waking the bot",
    env: "prod",
    fixture: "exhaust-ai",
    prompt: "Reply with the word SHOULD-NOT-RUN.",
    check: (e) => [
      ...expectStatus("skipped")(e),
      ...noTurns(e),
      ...(/allowance/i.test(e.routine?.lastError ?? "")
        ? []
        : [`lastError: ${e.routine?.lastError}`]),
    ],
  },
  "allowance-nearly-exhausted": {
    title: "A nearly spent allowance stops the turn and records the outcome",
    env: "prod",
    fixture: "nearly-exhaust-ai",
    prompt:
      "Write a detailed 600-word essay on the history of the telegraph, then a 600-word essay on the telephone.",
    check: (e) => [
      ...expectStatus("completed", "failed", "blocked", "skipped")(e),
      ...(e.overspendMicros > 50_000
        ? [`spent ${e.overspendMicros} micro$ past the allowance`]
        : []),
    ],
  },
  "allowance-mid-turn": {
    title: "Web searches stop when the allowance runs out mid-turn",
    env: "prod",
    fixture: "nearly-exhaust-ai",
    prompt:
      "Do three separate web searches, one each for: the population of Iceland, the height of Mount Kilimanjaro, and the year the Eiffel Tower opened. Report all three answers.",
    check: (e) => [
      ...expectStatus("completed", "failed", "blocked")(e),
      ...(e.overspendMicros > 10_000
        ? [`spent ${e.overspendMicros} micro$ past the allowance`]
        : []),
    ],
  },
  "interrupted-turn": {
    title: "A turn cancelled mid-run recovers on the next run",
    env: "prod",
    prompt:
      "Search the web for each of these five topics separately and write a 300-word summary of each: the Apollo program, the Hubble telescope, the ISS, the Voyager probes, the James Webb telescope.",
    // Judged after `rerun`: the next run must complete, and the cancelled
    // run must not leave the routine stuck in `started`
    check: (e) => expectStatus("completed")(e),
  },
  "memory-recall": {
    title: "A memory saved in one chat is recalled in a new chat",
    env: "prod",
    prompt:
      "Remember this about me for future chats: my test project is codenamed GREY-OWL-4. Save it to memory, then confirm in one sentence.",
    // The second run (rerun --new-chat) asks for the codename
    check: (e) => [
      ...expectStatus("completed")(e),
      ...(e.chatPreview?.includes("GREY-OWL-4")
        ? []
        : ["the new chat's reply lacks GREY-OWL-4"]),
    ],
  },
  "missed-run": {
    title: "A run found past its grace window is skipped, not replayed",
    env: "prod",
    fixture: "missed",
    prompt: "Reply with the word SHOULD-NOT-RUN.",
    check: (e) => [
      ...expectStatus("skipped")(e),
      ...noTurns(e),
      ...(e.activity.some((a) => a.dedupeKey?.endsWith(":missed"))
        ? []
        : ["no missed activity"]),
    ],
  },
  "computer-open": {
    title: "Computer opens a site and writes a file (then pauses)",
    env: "prod",
    prompt:
      "On your computer, open https://example.com in the browser, look at the screen, and tell me the page's main heading. Then write the heading to the file reliability/marker.txt. Do not click anything on the page.",
    check: (e) => [
      ...expectStatus("completed")(e),
      ...(e.computer?.sandboxId ? [] : ["no computer created"]),
      ...(e.computer?.paused === false ? ["computer left running"] : []),
    ],
  },
  "computer-approval": {
    title: "A committing click is held for approval; approval runs it once",
    env: "dev",
    prompt:
      "On your computer, open https://httpbin.org/forms/post, type the name Reliability Test in the Customer name field, and submit the form with the Submit order button. This is a test echo site. Report the page you get back.",
    // Before `decide`: held. After: the approved step ran exactly once.
    check: (e, s) => {
      const executed = e.approvals.filter((a) => a.state === "executed")
      return [
        ...(e.approvals.length ? [] : ["no approval was requested"]),
        ...(s.dispatched < 2
          ? expectStatus("blocked")(e)
          : executed.length === 1
            ? []
            : [`${executed.length} approvals executed after approval`]),
        ...(e.approvals.length > 1 ? ["asked for approval again"] : []),
      ]
    },
  },
  "downgraded-bot": {
    title: "A bot beyond the free plan's limit is skipped, not run",
    env: "prod",
    fixture: "downgraded",
    prompt: "Reply with the word SHOULD-NOT-RUN.",
    check: (e) => [
      ...expectStatus("skipped")(e),
      ...noTurns(e),
      ...(/plan/i.test(e.routine?.lastError ?? "")
        ? []
        : [`lastError: ${e.routine?.lastError}`]),
    ],
  },
  "setup-onboarding": {
    title: "A new bot greets, asks its setup questions and saves its config",
    env: "dev",
    start: "setup",
    prompt: "",
    // Greeting, then the owner's answer, then "Save it" on the bot's
    // confirmation question: only after that third message is it configured
    check: (e, s) =>
      s.dispatched < 3
        ? e.chatPreview
          ? []
          : ["no greeting"]
        : [
            ...(e.bot?.setupComplete ? [] : ["setup not complete"]),
            ...(e.bot?.job && e.bot.job !== "Not configured"
              ? []
              : ["job not saved"]),
          ],
  },
  "routine-from-chat": {
    title: "A weekday 9am routine created from chat runs at 9am local",
    env: "dev",
    start: "chat",
    prompt: "",
    // The account has no saved timezone, so the bot should ask before
    // scheduling by clock time; once told New York, Monday 9:00 EDT.
    check: (e) => {
      const made = e.routines.find((r) => r.schedule.kind === "daily")
      if (!made) return ["no daily routine was created"]
      return [
        ...(made.timezone === "America/New_York"
          ? []
          : [`timezone ${made.timezone}`]),
        ...(made.schedule.kind === "daily" &&
        made.schedule.time === "09:00" &&
        made.schedule.days.join() === "1,2,3,4,5"
          ? []
          : [`schedule ${JSON.stringify(made.schedule)}`]),
        ...(made.nextRunAt &&
        new Date(made.nextRunAt).toISOString() === "2026-10-19T13:00:00.000Z"
          ? []
          : [`nextRunAt ${made.nextRunAt}`]),
      ]
    },
  },
  "duplicate-dispatch": {
    title: "The same routine run dispatched twice produces one turn",
    env: "dev",
    prompt: "Reply with one sentence containing the word ONCE.",
    check: (e, s) => [
      ...expectStatus("completed")(e),
      ...(e.turns.length === s.dispatched
        ? []
        : [`turns ${e.turns.length}, expected ${s.dispatched}`]),
      ...(e.activity.filter((a) => a.kind === "routine_started").length === 1
        ? []
        : ["routine_started not exactly once"]),
    ],
  },
}

function sh(command: string, args: string[]) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  })
}

async function load(tag: string): Promise<State> {
  return JSON.parse(await readFile(`${DIR}/${tag}.json`, "utf8")).state
}

async function save(state: State, evidence?: unknown) {
  await mkdir(DIR, { recursive: true })
  await writeFile(
    `${DIR}/${state.tag}.json`,
    JSON.stringify({ state, evidence }, null, 2)
  )
}

function assertTestAccount(userId: string) {
  if (!userId.startsWith(PREFIX))
    throw new Error(`Refusing to touch ${userId}: not a reliability account`)
}

// The next whole minute at least 45 seconds out, so the cron sees it due once
function soon() {
  const at = new Date(Date.now() + 105_000)
  at.setUTCSeconds(0, 0)
  return at
}

async function create(name: string) {
  const scenario = scenarios[name]
  if (!scenario) throw new Error(`Unknown scenario ${name}`)
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "")
  const tag = `${date}-${name}-${randomBytes(3).toString("hex")}`
  const userId = `${PREFIX}${tag}`
  const operationId = teamOperationId(userId, "bot-setup", "reliability")
  // The same provisioning createBot does: a preset bot, or a blank one in
  // setup mode. The free plan's one-bot check runs inside.
  const { bot, chatId } = await provisionTeammate(
    userId,
    scenario.start === "setup"
      ? {
          name: "New Bot",
          job: "Not configured",
          instructions: null,
          avatar: "blob:sunny:0",
        }
      : {
          name: "Relay",
          job: "Reliability test assistant",
          instructions:
            "You are a test bot for Krafty's reliability harness. Keep replies short.",
          avatar: `blob:sunny:0`,
        },
    { botId: `bot_${operationId}`, chatId: `chat_${operationId}` },
    { setup: scenario.start === "setup", computer: false }
  )
  if (scenario.start) {
    if (scenario.start === "setup")
      await startBotSetupSession(chatId, bot, "Reliability")
    const state: State = {
      tag,
      scenario: name,
      env: scenario.env,
      userId,
      botId: bot.id,
      chatId,
      routineId: "",
      createdAt: new Date().toISOString(),
      commit: sh("git", ["rev-parse", "--short", "HEAD"]).trim(),
      dispatched: scenario.start === "setup" ? 1 : 0,
    }
    await save(state)
    console.log(JSON.stringify({ tag, userId, chatId }))
    return
  }

  const timezone = "America/New_York"
  const at = soon()
  const schedule =
    scenario.schedule === "daily"
      ? {
          kind: "daily" as const,
          time: new Intl.DateTimeFormat("en-GB", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).format(at),
          days: [0, 1, 2, 3, 4, 5, 6],
        }
      : {
          kind: "once" as const,
          // Dev routines are never left due for the production cron
          at: (scenario.env === "dev"
            ? new Date(Date.now() + 7 * 86_400_000)
            : at
          ).toISOString(),
        }
  const routine = await createRoutine(
    userId,
    {
      requestId: "reliability",
      botId: bot.id,
      title: scenario.title.slice(0, 60),
      prompt: scenario.prompt,
      schedule,
      timezone,
    },
    { chatId }
  )

  if (scenario.env === "dev")
    await updateRoutine(userId, routine.id, { enabled: false })
  if (scenario.fixture === "downgraded")
    // As if the account had two bots on a paid plan and then downgraded: the
    // older bot is the one the free plan keeps, so the routine's bot is now
    // over the limit. (Creating a routine for it would already be refused.)
    await db.insert(bots).values({
      id: `bot_${tag.replaceAll("-", "_")}_older`,
      userId,
      name: "Older bot",
      job: "Kept on the free plan",
      createdAt: new Date(Date.now() - 86_400_000),
    })
  if (scenario.fixture === "missed") {
    // As if the worker had been down for 7 hours: due 7 hours ago, past the
    // one-off grace window of 6. Both the schedule and nextRunAt move, the
    // way a real one-off looks when nobody claimed it.
    const due = new Date(Date.now() - 7 * 3_600_000)
    due.setUTCSeconds(0, 0)
    await db
      .update(routines)
      .set({
        nextRunAt: due,
        schedule: { kind: "once", at: due.toISOString() },
      })
      .where(eq(routines.id, routine.id))
  }
  if (
    scenario.fixture === "exhaust-ai" ||
    scenario.fixture === "nearly-exhaust-ai"
  )
    // Simulated earlier spend, so the real gate sees an empty allowance
    await db.insert(usageEntries).values({
      userId,
      kind: "ai",
      amount: scenario.fixture === "exhaust-ai" ? 1_000_000 : 995_000,
      idempotencyKey: `reliability:${tag}:fixture`,
    })

  const state: State = {
    tag,
    scenario: name,
    env: scenario.env,
    userId,
    botId: bot.id,
    chatId,
    routineId: routine.id,
    createdAt: new Date().toISOString(),
    commit: sh("git", ["rev-parse", "--short", "HEAD"]).trim(),
    // Skipped scenarios never wake the bot; dev runs count at `fire`
    dispatched:
      scenario.env === "prod" &&
      scenario.fixture !== "exhaust-ai" &&
      scenario.fixture !== "missed" &&
      scenario.fixture !== "downgraded"
        ? 1
        : 0,
  }
  await save(state)
  console.log(
    JSON.stringify({
      tag,
      userId,
      chatId,
      due: scenario.env === "prod" ? at : null,
    })
  )
}

async function routineRow(state: State) {
  const [row] = await db
    .select()
    .from(routines)
    .where(
      and(eq(routines.id, state.routineId), eq(routines.userId, state.userId))
    )
  if (!row) throw new Error("Routine not found")
  return row
}

async function rerun(tag: string, prompt?: string, newChat = false) {
  const state = await load(tag)
  assertTestAccount(state.userId)
  if (state.env !== "prod") throw new Error("rerun is for prod scenarios")
  const at = soon()
  if (newChat) {
    // A second direct chat with the same bot, as the sidebar's new chat makes,
    // and the routine recreated to report there (free plan: one routine)
    const current = await routineRow(state)
    const chatId = `chat_${randomBytes(16).toString("hex")}`
    await db.transaction(async (tx) => {
      await tx
        .insert(chats)
        .values({ id: chatId, userId: state.userId, kind: "direct" })
      await tx.insert(chatMembers).values({ chatId, botId: state.botId })
    })
    await deleteRoutine(state.userId, state.routineId)
    const routine = await createRoutine(
      state.userId,
      {
        requestId: `reliability-${state.dispatched + 1}`,
        botId: state.botId,
        title: current.title,
        prompt: prompt ?? current.prompt,
        schedule: { kind: "once", at: at.toISOString() },
        timezone: current.timezone,
      },
      { chatId }
    )
    state.chatId = chatId
    state.routineId = routine.id
  } else
    await updateRoutine(state.userId, state.routineId, {
      enabled: true,
      schedule: { kind: "once", at: at.toISOString() },
      ...(prompt && { prompt }),
    })
  state.dispatched++
  await save(state)
  console.log(JSON.stringify({ tag, due: at }))
}

async function fire(tag: string, twice: boolean) {
  const state = await load(tag)
  if (state.env !== "dev") throw new Error("fire is for dev scenarios")
  const routine: Routine = await routineRow(state)
  const scheduledAt = new Date(Math.floor(Date.now() / 10_000) * 10_000)
  const results = [await runRoutine(routine, scheduledAt)]
  if (twice) results.push(await runRoutine(routine, scheduledAt))
  state.dispatched++
  await save(state)
  console.log(JSON.stringify({ tag, scheduledAt, results }))
}

// questionId: the askUser toolCallId this answers, as a tapped option sends
async function say(tag: string, text: string, questionId?: string) {
  const state = await load(tag)
  if (state.env !== "dev") throw new Error("say is for dev scenarios")
  const id = `reliability_${randomBytes(6).toString("hex")}`
  await postChatMessage(
    state.chatId,
    { id, text, ...(questionId && { questionId }) },
    { botId: state.botId }
  )
  state.dispatched++
  await save(state)
  console.log(JSON.stringify({ tag, messageId: id }))
}

async function decide(tag: string, decision: "approve" | "deny") {
  const state = await load(tag)
  if (state.env !== "dev") throw new Error("decide is for dev scenarios")
  const [pending] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(eq(approvals.userId, state.userId), eq(approvals.state, "pending"))
    )
    .orderBy(asc(approvals.createdAt))
  if (!pending) throw new Error("No pending approval")
  await decideApproval(state.userId, pending.id, decision)
  state.dispatched++
  await save(state)
  console.log(JSON.stringify({ tag, approvalId: pending.id, decision }))
}

function triggerRuns(state: State) {
  try {
    const ref = process.env.TRIGGER_PROJECT_REF
    if (!ref) return { error: "TRIGGER_PROJECT_REF not set" }
    const output = sh("npx", [
      "-y",
      "trigger.dev@4.7.4",
      "runs",
      "list",
      "--tag",
      `chat:${state.chatId}`,
      "--env",
      state.env,
      "-p",
      ref,
      "--profile",
      "ai-teammates",
      "--skip-telemetry",
      "--limit",
      "20",
    ])
    return output
      .split("\n")
      .filter((line) => line.includes("run_"))
      .map((line) => {
        const [id, task, status, version, created] = line
          .split("│")
          .map((cell) => cell.trim())
          .filter(Boolean)
        return { id, task, status, version, created }
      })
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 200) : "?" }
  }
}

async function collect(state: State) {
  const { userId } = state
  const routine = state.routineId ? await routineRow(state) : undefined
  const [bot] = await db
    .select({
      name: bots.name,
      job: bots.job,
      setupComplete: bots.setupComplete,
      instructions: bots.instructions,
    })
    .from(bots)
    .where(and(eq(bots.id, state.botId), eq(bots.userId, userId)))
  const routineRows = await db
    .select({
      id: routines.id,
      title: routines.title,
      schedule: routines.schedule,
      timezone: routines.timezone,
      nextRunAt: routines.nextRunAt,
      enabled: routines.enabled,
    })
    .from(routines)
    .where(eq(routines.userId, userId))
  const routineCount = { n: routineRows.length }
  const activity = await db
    .select({
      kind: activityEvents.kind,
      title: activityEvents.title,
      detail: activityEvents.detail,
      dedupeKey: activityEvents.dedupeKey,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(eq(activityEvents.userId, userId))
    .orderBy(asc(activityEvents.createdAt))
  const usage = await db
    .select({
      kind: usageEntries.kind,
      amount: usageEntries.amount,
      key: usageEntries.idempotencyKey,
    })
    .from(usageEntries)
    .where(eq(usageEntries.userId, userId))
    .orderBy(asc(usageEntries.createdAt))
  // One ledger key per turn: ai:<runId>:<turn>; suffixed keys are sub-spends
  const turns = usage
    .map((u) => u.key)
    .filter((key) => /^ai:run_[a-z0-9]+:\d+$/.test(key))
  const approvalRows = await db
    .select({
      id: approvals.id,
      kind: approvals.kind,
      state: approvals.state,
      toolSlug: approvals.toolSlug,
      action: approvals.action,
      hostname: approvals.hostname,
      uses: approvals.uses,
      result: approvals.result,
      summary: approvals.summary,
    })
    .from(approvals)
    .where(eq(approvals.userId, userId))
  const memoryRows = await db
    .select({
      content: memories.content,
      kind: memories.kind,
      status: memories.status,
    })
    .from(memories)
    .where(eq(memories.userId, userId))
  const [chat] = await db
    .select({ preview: chats.lastMessagePreview })
    .from(chats)
    .where(and(eq(chats.id, state.chatId), eq(chats.userId, userId)))
  const [computer] = await db
    .select({ sandboxId: computers.sandboxId })
    .from(computers)
    .where(eq(computers.userId, userId))
  let computerState: {
    sandboxId: string
    exists: boolean
    paused?: boolean
  } | null = null
  if (computer?.sandboxId) {
    const exists = await sandboxExists(computer.sandboxId)
    computerState = {
      sandboxId: computer.sandboxId,
      exists,
      paused: exists ? await isSandboxPaused(computer.sandboxId) : undefined,
    }
  }
  const aiUsed = usage
    .filter((u) => u.kind === "ai")
    .reduce((sum, u) => sum + u.amount, 0)
  const activeMemories = memoryRows.filter((m) => m.status === "active")
  const duplicateMemories =
    activeMemories.length -
    new Set(activeMemories.map((m) => m.content.toLowerCase().trim())).size
  const startsPerRun = new Map<string, number>()
  for (const a of activity)
    if (a.kind === "routine_started")
      startsPerRun.set(
        a.dedupeKey ?? "",
        (startsPerRun.get(a.dedupeKey ?? "") ?? 0) + 1
      )
  return {
    routine: routine && {
      lastStatus: routine.lastStatus,
      lastError: routine.lastError,
      lastRunAt: routine.lastRunAt,
      nextRunAt: routine.nextRunAt,
      enabled: routine.enabled,
    },
    bot: bot && {
      name: bot.name,
      job: bot.job,
      setupComplete: bot.setupComplete,
      instructions: bot.instructions?.slice(0, 200) ?? null,
    },
    routineCount: routineCount.n,
    routines: routineRows,
    activity,
    usage,
    turns,
    runIds: [...new Set(turns.map((key) => key.split(":")[1]))],
    approvals: approvalRows,
    memories: memoryRows,
    chatPreview: chat?.preview ?? null,
    computer: computerState,
    // Free plan: $1 lifetime. Spend past it is an overspend.
    overspendMicros: Math.max(0, aiUsed - 1_000_000),
    duplicates: {
      // A turn the harness didn't cause: a duplicate dispatch or replay
      extraTurns: Math.max(0, turns.length - state.dispatched),
      routineStartsOverOne: [...startsPerRun.values()].filter((n) => n > 1)
        .length,
      approvalsExecutedOverOne: Math.max(
        0,
        approvalRows.filter((a) => a.state === "executed").length - 1
      ),
      duplicateMemories,
      unattendedRoutineCreates: Math.max(0, routineCount.n - 1),
    },
  }
}

async function observe(tag: string, wait: boolean) {
  const state = await load(tag)
  assertTestAccount(state.userId)
  const deadline = Date.now() + 8 * 60_000
  let evidence = await collect(state)
  const settled = (e: Evidence) =>
    (!e.routine ||
      (TERMINAL as readonly string[]).includes(e.routine.lastStatus ?? "")) &&
    e.turns.length >= state.dispatched
  while (wait && !settled(evidence) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    evidence = await collect(state)
    process.stderr.write(
      `.. ${evidence.routine?.lastStatus ?? "pending"} turns=${evidence.turns.length}/${state.dispatched}\n`
    )
  }
  // Give onTurnComplete's last writes a moment after the status lands
  if (wait) await new Promise((resolve) => setTimeout(resolve, 10_000))
  evidence = await collect(state)
  const runs = triggerRuns(state)
  const failures = scenarios[state.scenario].check(evidence, state)
  const duplicates = Object.values(evidence.duplicates).reduce(
    (a, b) => a + b,
    0
  )
  const result = failures.length ? "FAIL" : "PASS"
  await save(state, { ...evidence, triggerRuns: runs, failures, result })
  console.log(
    JSON.stringify(
      {
        tag,
        scenario: state.scenario,
        env: state.env,
        result,
        failures,
        duplicates: duplicates ? evidence.duplicates : 0,
        routine: evidence.routine,
        routines: evidence.routines,
        bot: evidence.bot,
        runIds: evidence.runIds,
        triggerRuns: runs,
        chatPreview: evidence.chatPreview,
        computer: evidence.computer,
        approvals: evidence.approvals.map((a) => ({ ...a, result: a.result })),
        activity: evidence.activity.map((a) => `${a.kind}: ${a.title}`),
        usage: evidence.usage.map((u) => `${u.kind} ${u.amount} ${u.key}`),
        memories: evidence.memories,
      },
      null,
      2
    )
  )
}

// Disables every routine of the test account, so no cron ever runs it again
async function stop(tag: string) {
  const state = await load(tag)
  assertTestAccount(state.userId)
  const rows = await db
    .update(routines)
    .set({ enabled: false, nextRunAt: null })
    .where(eq(routines.userId, state.userId))
    .returning({ id: routines.id })
  console.log(JSON.stringify({ tag, disabled: rows.length }))
}

async function closeComputer(tag: string) {
  const state = await load(tag)
  assertTestAccount(state.userId)
  await deleteAccountComputer(state.userId)
  console.log(JSON.stringify({ tag, computer: "deleted" }))
}

const [command, ...args] = process.argv.slice(2)
try {
  if (command === "list")
    for (const [name, s] of Object.entries(scenarios))
      console.log(`${name.padEnd(28)} ${s.env.padEnd(5)} ${s.title}`)
  else if (command === "create") await create(args[0])
  else if (command === "rerun")
    await rerun(
      args[0],
      args.slice(1).find((arg) => !arg.startsWith("--")),
      args.includes("--new-chat")
    )
  else if (command === "fire") await fire(args[0], args.includes("--twice"))
  else if (command === "say") {
    const question = args.indexOf("--question")
    await say(
      args[0],
      args.slice(1, question === -1 ? undefined : question).join(" "),
      question === -1 ? undefined : args[question + 1]
    )
  } else if (command === "decide")
    await decide(args[0], args[1] === "deny" ? "deny" : "approve")
  else if (command === "observe")
    await observe(args[0], args.includes("--wait"))
  else if (command === "close-computer") await closeComputer(args[0])
  else if (command === "stop") await stop(args[0])
  else if (command === "accounts") {
    const rows = await db.execute(
      sql`select distinct user_id from bots where user_id like ${`${PREFIX}%`}`
    )
    console.log(rows.rows.map((row) => row.user_id).join("\n"))
  } else throw new Error(`Unknown command ${command}`)
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
