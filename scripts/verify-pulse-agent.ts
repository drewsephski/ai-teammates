// Krafty Pulse end to end on the real chat model, with live Composio Google
// Sheets schemas and a simulated spreadsheet (tests/helpers/pulse-tracker.ts).
// Nothing reaches Google: execution is simulated, and writes stop at a
// simulated approval card. Costs a few cents of model calls per run.
//
// Run: pnpm exec tsx --env-file=.env.local scripts/verify-pulse-agent.ts \
//   [--anthropic] [--runs 2] [--scenario report|write|unknown|approved]
import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { Composio } from "@composio/core"
import { isStepCount, streamText, tool, type ModelMessage } from "ai"
import { z } from "zod"

import { appToolRisk, approvalExecutedPrompt } from "../lib/approval-policy"
import { botTemplateInstructions, findBotTemplate } from "../lib/bot-templates"
import { buildChatInstructions } from "../lib/chat-instructions"
import { createAppTools, type AppTool } from "../lib/connector-tools"
import { chatModel, chatModelCost } from "../lib/model"
import { routineClock, zonedParts } from "../lib/routine-policy"
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
const scenario = flags.scenario as "report" | "write" | "unknown" | "approved"

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
  assert.ok(catalog.some((t) => t.slug === slug), `Missing schema: ${slug}`)

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
      accounts: async () => [
        { id: "evaluation-account", toolkit: "googlesheets" },
      ],
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
                              gridProperties: { rowCount: 1000, columnCount: 26 },
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
  const askUser = tool({
    description:
      "Ask the person a question and wait for the answer. Ends your reply.",
    inputSchema: z.object({
      question: z.string(),
      options: z.array(z.string()).optional(),
    }),
    execute: async () => ({ status: "asked" }),
  })
  const messages = messagesFor()
  const model = chatModel(messages, { anthropic: flags.anthropic })
  let cost = 0
  const result = streamText({
    model,
    system: buildChatInstructions(bot, undefined, true, false, false, undefined, {
      paid: false,
      clock: routineClock(timezone, now),
    }),
    messages,
    tools: { ...tools, askUser },
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
  if (scenario === "report") {
    const rows = mentionedRows(text)
    const expected = pulseExpectations.map((e) => e.row)
    record.found = expected.filter((row) => rows.has(row))
    record.missed = expected.filter((row) => !rows.has(row))
    // Rows a good report mentions as context: the first data row, the task
    // due today (10) and the "TBD" due date (18)
    const context = [4, 10, 18]
    record.extra = [...rows].filter(
      (row) =>
        row >= 4 && row <= 42 && !expected.includes(row) && !context.includes(row)
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
console.log(`\n${scenario}: ${runs} run(s), $${total.toFixed(4)} in model calls`)
