// Exercises the real chat model with current Composio schemas and simulated
// execution. This script cannot send mail: it never calls a provider executor.
// Run: pnpm exec tsx --env-file=.env.local scripts/verify-connector-agent.ts
import assert from "node:assert/strict"
import { Composio } from "@composio/core"
import { generateText, isStepCount, type ModelMessage } from "ai"
import { connectedAppInstructions } from "../lib/agent-tool-instructions"
import { botPersonalityInstructions } from "../lib/bot-personality"
import { createAppTools, type AppTool } from "../lib/connector-tools"
import { chatModel } from "../lib/model"

const slugs = [
  "GMAIL_SEND_EMAIL",
  "GMAIL_CREATE_EMAIL_DRAFT",
  "GMAIL_SEND_DRAFT",
  "GMAIL_FETCH_EMAILS",
]
const client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
// Catalog/schema reads only. No connected account or execution API is used.
const definitions = await client.tools.getRawComposioTools(
  { tools: slugs },
  undefined,
  { signal: AbortSignal.timeout(30_000) }
)
const catalog: AppTool[] = definitions.map((entry) => ({
  slug: entry.slug,
  toolkit: entry.toolkit?.slug.toLowerCase() ?? "gmail",
  description: entry.description ?? entry.slug,
  inputSchema: entry.inputParameters,
  outputSchema: entry.outputParameters,
}))
for (const slug of slugs)
  assert.ok(
    catalog.some((t) => t.slug === slug),
    `Missing live schema: ${slug}`
  )

const scenarios: {
  name: string
  messages: ModelMessage[]
  timeoutSend?: boolean
  draftThenSendOnly?: boolean
  expected: string
}[] = [
  {
    name: "new email sends directly once",
    messages: [
      {
        role: "user",
        content:
          "Send an email now to recipient@example.com, subject Demo, with exactly this body: Hello!\n\nThis is a demo.\n\nDrew",
      },
    ],
    expected: "GMAIL_SEND_EMAIL",
  },
  {
    name: "draft request saves without sending",
    messages: [
      {
        role: "user",
        content:
          "Save a Gmail draft to recipient@example.com, subject Demo, body Hello from Drew. Do not send it.",
      },
    ],
    expected: "GMAIL_CREATE_EMAIL_DRAFT",
  },
  {
    name: "approval after worker restart sends the existing draft",
    messages: [
      {
        role: "user",
        content:
          "Draft an email to recipient@example.com with subject Demo and body Hello from Drew.",
      },
      {
        role: "assistant",
        content:
          "Saved the draft using GMAIL_CREATE_EMAIL_DRAFT. Returned draft ID: r-approved-123; message ID: message-456. To: recipient@example.com. Subject: Demo. Body: Hello from Drew. GMAIL_SEND_DRAFT sends a saved draft. Ready to send?",
      },
      { role: "user", content: "Yes, send it." },
    ],
    expected: "GMAIL_SEND_DRAFT",
  },
  {
    name: "draft-then-send uses the newly returned draft ID once",
    messages: [
      {
        role: "user",
        content:
          "Send an email now to recipient@example.com, subject Demo, body Hello from Drew.",
      },
    ],
    draftThenSendOnly: true,
    expected: "GMAIL_SEND_DRAFT",
  },
  {
    name: "ambiguous send outcome verifies before any retry",
    messages: [
      {
        role: "user",
        content:
          "Send an email now to recipient@example.com, subject Demo, body Hello from Drew.",
      },
    ],
    timeoutSend: true,
    expected: "GMAIL_SEND_EMAIL",
  },
]

for (const scenario of scenarios) {
  const available = scenario.draftThenSendOnly
    ? catalog.filter((entry) => entry.slug !== "GMAIL_SEND_EMAIL")
    : catalog
  const calls: { slug: string; input: Record<string, unknown> }[] = []
  const schemaLoads: string[] = []
  const tools = createAppTools("evaluation-user", {
    accounts: async () => [{ id: "evaluation-account", toolkit: "gmail" }],
    search: async () => ({
      tools: available,
      guidance: {
        recommendedPlanSteps: [
          "Use direct send for new mail, create a draft for draft-only requests, send an existing draft by its draft ID.",
        ],
        knownPitfalls: [
          "Creating a draft does not send email. Never retry an uncertain send before checking Sent.",
        ],
      },
    }),
    schema: async (slug) => {
      schemaLoads.push(slug)
      return available.find((entry) => entry.slug === slug)
    },
    execute: async (_user, slug, input) => {
      calls.push({ slug, input })
      if (scenario.timeoutSend && slug === "GMAIL_SEND_EMAIL")
        throw new Error(
          "Simulated transport timeout after provider accepted send"
        )
      const data =
        slug === "GMAIL_CREATE_EMAIL_DRAFT"
          ? { id: "r-created-123", message: { id: "message-456" } }
          : slug === "GMAIL_FETCH_EMAILS"
            ? {
                messages: [
                  {
                    id: "sent-789",
                    labelIds: ["SENT"],
                    to: "recipient@example.com",
                    subject: "Demo",
                    messageText: "Hello from Drew.",
                  },
                ],
              }
            : { id: "sent-789", labelIds: ["SENT"] }
      return {
        resultType: "completed",
        error: null,
        logId: "evaluation-log",
        data,
      }
    },
  })
  const result = await generateText({
    model: chatModel(scenario.messages),
    instructions: [
      "You are Editor Bot, Drew's writing assistant. Complete the user's email task.",
      botPersonalityInstructions,
      connectedAppInstructions(true, false),
    ].join("\n\n"),
    messages: scenario.messages,
    tools,
    stopWhen: isStepCount(12),
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(90_000),
  })
  const writes = calls.filter((call) => call.slug !== "GMAIL_FETCH_EMAILS")
  assert.deepEqual(
    writes.map((call) => call.slug),
    scenario.draftThenSendOnly
      ? ["GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_SEND_DRAFT"]
      : [scenario.expected],
    scenario.name
  )
  if (scenario.draftThenSendOnly) {
    assert.equal(writes[1].input.draft_id, "r-created-123")
  } else if (scenario.expected === "GMAIL_SEND_DRAFT") {
    assert.equal(writes[0].input.draft_id, "r-approved-123")
    assert.ok(
      schemaLoads.includes("GMAIL_SEND_DRAFT"),
      "Approval turn should reload the exact schema"
    )
  }
  if (scenario.timeoutSend)
    assert.ok(
      calls.some((call) => call.slug === "GMAIL_FETCH_EMAILS"),
      "Uncertain send should be verified using a read"
    )
  assert.ok(result.text.trim(), "The user should receive a final response")
  console.log(
    JSON.stringify({
      scenario: scenario.name,
      passed: true,
      steps: result.steps.length,
      tools: calls.map((call) => call.slug),
      schemaLoads,
    })
  )
}
