// Krafty Pulse end to end on the real chat model, with live Composio Google
// Sheets schemas and a simulated spreadsheet (tests/helpers/pulse-tracker.ts).
// Nothing reaches Google: execution is simulated, and writes stop at a
// simulated approval card. Costs a few cents of model calls per run.
//
// Run: pnpm exec tsx --env-file=.env.local scripts/verify-pulse-agent.ts \
//   [--anthropic] [--runs 2]
//   [--scenario report|write|unknown|approved|schedule|expired|connect]
import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { Composio } from "@composio/core"
import { isStepCount, streamText, type ModelMessage } from "ai"

import { appToolRisk, approvalExecutedPrompt } from "../lib/approval-policy"
import { createAppCatalogTools } from "../lib/app-catalog-tools"
import { appIntent, appIntentInstructions } from "../lib/app-intent"
import { createBotSetupTools } from "../lib/bot-setup-tools"
import { botTemplateInstructions, findBotTemplate } from "../lib/bot-templates"
import { buildChatInstructions } from "../lib/chat-instructions"
import { createAppTools, type AppTool } from "../lib/connector-tools"
import { chatModel, chatModelCost } from "../lib/model"
import {
  describeSchedule,
  nextRunAt,
  routineClock,
  routineRunPrompt,
  zonedParts,
} from "../lib/routine-policy"
import { createRoutineTools } from "../lib/routine-tools"
import type { PublicRoutine } from "../lib/routines"
import { rangeOrigin } from "../lib/tracker-review"
import {
  pulseExpectations,
  pulseTrackerValues,
} from "../tests/helpers/pulse-tracker"

const { values: flags } = parseArgs({
  options: {
    anthropic: { type: "boolean", default: false },
    runs: { type: "string", default: "1" },
    scenario: { type: "string", default: "report" },
  },
})
const runs = Number(flags.runs)
const scenario = flags.scenario as
  | "report"
  | "write"
  | "unknown"
  | "approved"
  | "schedule"
  | "expired"
  | "connect"

const timezone = "America/Chicago"
const now = new Date()
const parts = zonedParts(now, timezone)
const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
const values = pulseTrackerValues(today)
const sheetId = "1PulseEvalTracker000000000000000000000000000"
const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`

const slugs = [
  "GOOGLESHEETS_SEARCH_SPREADSHEETS",
  "GOOGLESHEETS_GET_SPREADSHEET_INFO",
  "GOOGLESHEETS_GET_SHEET_NAMES",
  "GOOGLESHEETS_BATCH_GET",
  "GOOGLESHEETS_VALUES_GET",
  "GOOGLESHEETS_VALUES_UPDATE",
  "GOOGLESHEETS_UPDATE_VALUES_BATCH",
  "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
  "GOOGLESHEETS_FIND_REPLACE",
]
const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
// Catalog reads only: no connected account or execution API is used
const definitions = await client.tools.getRawComposioTools(
  { tools: slugs },
  undefined,
  { signal: AbortSignal.timeout(30_000) }
)
const tags = new Map(definitions.map((d) => [d.slug, d.tags ?? []]))
const catalog: AppTool[] = definitions.map((d) => ({
  slug: d.slug,
  toolkit: "googlesheets",
  description: d.description ?? d.slug,
  inputSchema: d.inputParameters,
  outputSchema: d.outputParameters,
}))
for (const slug of slugs)
  assert.ok(
    catalog.some((t) => t.slug === slug),
    `Missing schema: ${slug}`
  )

const template = findBotTemplate("project-coordinator")
assert.ok(template)
const bot = {
  id: "bot_pulse_eval",
  name: template.name,
  job: template.job,
  instructions: botTemplateInstructions(template),
  setupComplete: true,
}

type Call = { slug: string; input: Record<string, unknown> }

// Rows mentioned as "row 12", "Row 12", "r12", "| 12 |" (a table's first cell)
function mentionedRows(text: string) {
  const rows = new Set<number>()
  for (const match of text.matchAll(/\b(?:rows?|r)\s*#?\s*(\d{1,3})\b/gi))
    rows.add(Number(match[1]))
  for (const match of text.matchAll(/^\|\s*(\d{1,3})\s*\|/gm))
    rows.add(Number(match[1]))
  return rows
}

function messagesFor(): ModelMessage[] {
  const brief = `${template!.prompt} The tracker is ${sheetUrl}`
  if (scenario === "report") return [{ role: "user", content: brief }]
  // A new Pulse bot's first reply after its opening, before any app is
  // connected: the person answers with just the link
  if (scenario === "connect")
    return [
      {
        role: "assistant",
        content:
          "On the first run I'll read your project tracker in Google Sheets, confirm which columns hold the task, owner, status, due date and last update, then list what's overdue, blocked or quiet for five days with draft follow-ups and a short summary. You'll need to connect Google Sheets. Anything to change before I start?",
      },
      { role: "user", content: `Sounds good, here's the tracker: ${sheetUrl}` },
    ]
  // A weekly run, posted the way run-routines posts it, after the person's
  // Google connection lapsed
  if (scenario === "expired")
    return [
      {
        role: "user",
        content: routineRunPrompt({
          title: "Weekly tracker check",
          prompt: `Review the project tracker ${sheetUrl} (tab Projects) with reviewTracker. List overdue, blocked and stale (5+ days) tasks with row numbers and owners, draft a follow-up for each owner, and write a five-line status summary. Don't change the sheet or send anything.`,
        }),
      },
    ]
  if (scenario === "schedule")
    return [
      { role: "user", content: brief },
      {
        role: "assistant",
        content:
          "Here's this week's report for the Projects tab: 9 tasks flagged (rows 5, 6, 7, 8, 9, 12, 16, 33 and 41), follow-ups drafted for Marcus, Lena, Tom, Priya and Sam, and a five-line summary. Want me to run this every week?",
      },
      {
        role: "user",
        content: "Yes, this looks right. Do it every Monday at 9am.",
      },
    ]
  const report: ModelMessage[] = [
    { role: "user", content: brief },
    {
      role: "assistant",
      content: `Read the Projects tab of your tracker. Columns: Task (B), Owner (C), Status (D), Due date (E), Last update (F). Homepage copy (row 5, Marcus) is overdue.`,
    },
  ]
  if (scenario === "write" || scenario === "unknown")
    return [
      ...report,
      {
        role: "user",
        content:
          "Homepage copy is finished. Mark row 5 as Done in the sheet and put today's date in its Last update cell.",
      },
    ]
  return [
    ...report,
    {
      role: "user",
      content:
        "Homepage copy is finished. Mark row 5 as Done in the sheet and put today's date in its Last update cell.",
    },
    {
      role: "assistant",
      content:
        "I've asked to set row 5's Status to Done and Last update to today. Approve the card and I'll check the sheet.",
    },
    {
      role: "user",
      // Exactly what Krafty posts after it ran an approved call
      content: approvalExecutedPrompt(
        { summary: "Mark Homepage copy (row 5) Done with today's date" },
        "approve",
        {
          ok: true,
          result: {
            status: "succeeded",
            data: { updatedRange: "Projects!D5:F5", updatedCells: 3 },
          },
        }
      ),
    },
  ]
}

const results = []
for (let run = 1; run <= runs; run++) {
  const calls: Call[] = []
  const held: Call[] = []
  // The sheet as the run left it: writes land on it, so a read-back shows
  // exactly what was written and where
  const sheet = values.map((row) => [...row])
  if (scenario === "approved") {
    sheet[4][3] = "Done"
    sheet[4][5] = usToday()
  }
  const touched = new Set<number>()
  const write = (slug: string, input: Record<string, unknown>) => {
    const ranges =
      slug === "GOOGLESHEETS_UPDATE_VALUES_BATCH"
        ? ((input.data as { range: string; values: unknown[][] }[]) ?? [])
        : [{ range: String(input.range), values: input.values as unknown[][] }]
    for (const { range, values: rows } of ranges) {
      const origin = rangeOrigin(range)
      rows?.forEach((cells, r) =>
        cells.forEach((value, c) => {
          const row = origin.row + r
          touched.add(row)
          sheet[row - 1] ??= []
          sheet[row - 1][origin.column + c] = String(value)
        })
      )
    }
  }
  const tools = createAppTools(
    "evaluation-user",
    {
      accounts: async () =>
        scenario === "connect"
          ? []
          : [{ id: "evaluation-account", toolkit: "googlesheets" }],
      search: async () => ({
        tools: catalog,
        guidance: {
          recommendedPlanSteps: [
            "Get the spreadsheet ID from the URL, list its sheets, then read values with GOOGLESHEETS_BATCH_GET.",
          ],
        },
      }),
      schema: async (slug) => catalog.find((entry) => entry.slug === slug),
      execute: async (_user, slug, input) => {
        calls.push({ slug, input })
        if (scenario === "expired")
          return {
            resultType: "failed",
            error: "invalid_grant: Token has been expired or revoked.",
            data: { status_code: 401 },
          }
        if (/UPDATE|APPEND|REPLACE/.test(slug)) {
          write(slug, input)
          if (scenario === "unknown")
            throw new Error("Simulated timeout after Google accepted the write")
        }
        const data =
          slug === "GOOGLESHEETS_BATCH_GET"
            ? {
                spreadsheetId: sheetId,
                valueRanges: [
                  {
                    range: "Projects!A1:Z1000",
                    majorDimension: "ROWS",
                    values: sheet,
                  },
                ],
              }
            : slug === "GOOGLESHEETS_VALUES_GET"
              ? {
                  range: "Projects!A1:Z1000",
                  majorDimension: "ROWS",
                  values: sheet,
                }
              : slug === "GOOGLESHEETS_GET_SHEET_NAMES"
                ? { sheet_names: ["Projects"] }
                : slug === "GOOGLESHEETS_SEARCH_SPREADSHEETS"
                  ? {
                      spreadsheets: [
                        { id: sheetId, name: "Website relaunch tracker" },
                      ],
                    }
                  : slug === "GOOGLESHEETS_GET_SPREADSHEET_INFO"
                    ? {
                        spreadsheetId: sheetId,
                        properties: { title: "Website relaunch tracker" },
                        sheets: [
                          {
                            properties: {
                              sheetId: 0,
                              title: "Projects",
                              gridProperties: {
                                rowCount: 1000,
                                columnCount: 26,
                              },
                            },
                          },
                        ],
                      }
                    : { updatedRange: "Projects!D5:F5", updatedCells: 3 }
        return { resultType: "completed", error: null, logId: "eval", data }
      },
    },
    {
      required: async (entry) =>
        scenario !== "unknown" &&
        appToolRisk(entry.slug, tags.get(entry.slug)) === "write",
      request: async (call) => {
        held.push({ slug: call.slug, input: call.input })
        return { approvalId: `apr_${held.length}`, summary: call.summary ?? "" }
      },
      claim: async () => undefined,
      complete: async () => {},
    },
    { timeZone: async () => timezone, now: () => now }
  )
  // Krafty's own askUser, with a catalog that says Google Sheets needs a
  // reconnect (lib/bot-setup-tools.ts)
  const { askUser } = createBotSetupTools(
    async () => assert.fail("a Pulse run never saves a profile"),
    {
      computerAvailable: false,
      prepareAppConnection: async (app) => ({
        name: app.name,
        logo: null,
        state: "connect",
        ...(scenario === "expired" && { reconnect: true }),
      }),
    }
  )
  const scheduled: { prompt: string; schedule: unknown }[] = []
  const routineTools = createRoutineTools(
    {
      timezone: async () => timezone,
      list: async () => [],
      create: async (input) => {
        scheduled.push({ prompt: input.prompt, schedule: input.schedule })
        return {
          id: "routine_eval",
          botId: bot.id,
          chatId: "chat_eval",
          title: input.title,
          prompt: input.prompt,
          schedule: input.schedule,
          timezone: input.timezone,
          enabled: true,
          nextRunAt: nextRunAt(input.schedule, input.timezone, now),
          lastRunAt: null,
          lastStatus: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
          description: describeSchedule(input.schedule, input.timezone),
        } as unknown as PublicRoutine
      },
      update: async () => assert.fail("no routine to update"),
      remove: async () => {},
    },
    { now: () => now }
  )
  const { findApps } = createAppCatalogTools(async () => ({
    configured: true,
    apps: [
      {
        toolkit: "googlesheets",
        name: "Google Sheets",
        connected: scenario !== "connect",
        connectable: true,
      } as never,
    ],
  }))
  const catalogTools = { findApps }
  const messages = messagesFor()
  // What trigger/chat.ts adds for the latest message (lib/app-intent.ts)
  const lastText = messages.at(-1)?.content
  const connection =
    typeof lastText === "string"
      ? appIntentInstructions(
          appIntent(lastText),
          new Set(scenario === "connect" ? [] : ["googlesheets"])
        )
      : undefined
  const model = chatModel(messages, { anthropic: flags.anthropic })
  let cost = 0
  const result = streamText({
    model,
    system: [
      buildChatInstructions(bot, undefined, true, false, false, undefined, {
        paid: false,
        clock: routineClock(timezone, now),
      }),
      connection,
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages,
    tools: { ...tools, askUser, ...routineTools, ...catalogTools },
    stopWhen: [
      isStepCount(16),
      ({ steps }) =>
        steps.some((step) =>
          step.toolResults.some((r) => r?.toolName === "askUser")
        ),
    ],
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(180_000),
    onStepEnd: (step) => {
      // chatModelCost is in millionths of a dollar
      cost += chatModelCost(step.usage, step.model.modelId) / 1_000_000
    },
  })
  const text = await result.text
  const steps = await result.steps
  const asked = steps.some((step) =>
    step.toolCalls.some((call) => call?.toolName === "askUser")
  )
  const record: Record<string, unknown> = {
    run,
    model: steps.at(-1)?.model.modelId,
    steps: steps.length,
    costUsd: Number(cost.toFixed(4)),
    reads: calls.filter((c) => !/UPDATE|APPEND|REPLACE/.test(c.slug)).length,
    reviewed: steps.some((step) =>
      step.toolCalls.some((call) => call?.toolName === "reviewTracker")
    ),
    asked,
  }
  if (scenario === "connect") {
    const first = steps.flatMap((step) => step.toolCalls).find(Boolean)
    record.firstTool = first?.toolName
    record.firstInput = first?.input
    record.connectCard = JSON.stringify(first?.input ?? {}).includes(
      "googlesheets"
    )
  } else if (scenario === "schedule") {
    record.scheduled = scheduled
    record.linkInPrompt = scheduled.some((r) => r.prompt.includes(sheetId))
  } else if (scenario === "expired") {
    record.askedReconnect = steps.some((step) =>
      step.toolCalls.some(
        (call) =>
          call?.toolName === "askUser" &&
          JSON.stringify(call.input).includes("googlesheets")
      )
    )
    // A report from a sheet it couldn't read would cite rows
    record.citedRows = [...mentionedRows(text)]
  } else if (scenario === "report") {
    const rows = mentionedRows(text)
    const expected = pulseExpectations.map((e) => e.row)
    record.found = expected.filter((row) => rows.has(row))
    record.missed = expected.filter((row) => !rows.has(row))
    // Rows a good report mentions as context: the first data row, the task
    // due today (10) and the "TBD" due date (18)
    const context = [4, 10, 18]
    record.extra = [...rows].filter(
      (row) =>
        row >= 4 &&
        row <= 42 &&
        !expected.includes(row) &&
        !context.includes(row)
    )
  } else {
    const writes = [...held, ...calls].filter((c) =>
      /UPDATE|APPEND|REPLACE/.test(c.slug)
    )
    record.writes = writes.map((w) => ({ slug: w.slug, input: w.input }))
    // Rows the simulated sheet saw written, and any that weren't row 5
    record.wrongRows = [...touched].filter((row) => row !== 5)
    record.readAfter = calls.some(
      (c, i) =>
        /GET/.test(c.slug) &&
        i > calls.findIndex((x) => /UPDATE|APPEND|REPLACE/.test(x.slug))
    )
  }
  record.reply = text
  results.push(record)
  console.log(JSON.stringify(record, null, 2))
}

function usToday() {
  return `${parts.month}/${parts.day}/${parts.year}`
}

const total = results.reduce((sum, r) => sum + (r.costUsd as number), 0)
console.log(
  `\n${scenario}: ${runs} run(s), $${total.toFixed(4)} in model calls`
)
