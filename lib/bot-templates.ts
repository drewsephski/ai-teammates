import { useCases } from "@/app/use-cases/use-cases-data"
import { botPresets, workflowExecutionInstructions } from "@/lib/bot-presets"
import { emailAssistantPage } from "@/lib/marketing/email-assistant"

// Bots people pick on a public page. "Create this Bot" links open
// /workspace?create=<id>, which previews the template and creates it with
// createBot({ presetId: id }). The page copy is the source: a template says
// no more than its page does.
export type BotTemplate = {
  id: string
  name: string
  job: string
  /** Fixed, so the bot looks like its preview (`blob:<shape>:<color>`). */
  avatar: string
  summary: string
  steps: string[]
  waitsForYou: string[]
  apps: string[]
  schedule: string
  /** The starter prompt from the page. The bot opens by proposing it. */
  prompt: string
}

const avatars: Record<string, string> = {
  "sales-outbound": "blob:pebble:8",
  "talent-scout": "blob:gem:2",
  "paid-media": "blob:leaf:5",
  "expense-manager": "blob:squircle:6",
  "product-performance": "blob:hex:0",
  "bug-reproduction": "blob:crystal:9",
  "account-health": "blob:dome:1",
  "chief-of-staff": "blob:arch:3",
  "support-triage": "blob:cloud:4",
  "email-assistant": "blob:bean:8",
}

const emailPrompt = emailAssistantPage.sections.find(
  (section) => section.id === "starter-prompt"
)?.body

export const botTemplates: BotTemplate[] = [
  ...useCases.map((useCase) => ({
    id: useCase.id,
    name: useCase.name,
    job: useCase.job,
    avatar: avatars[useCase.id],
    summary: useCase.summary,
    steps: useCase.steps,
    waitsForYou: useCase.waitsForYou,
    apps: useCase.apps,
    schedule: useCase.schedule,
    prompt: useCase.prompt,
  })),
  {
    id: "email-assistant",
    name: "Email Assistant",
    job: "Email assistant",
    avatar: avatars["email-assistant"],
    summary: emailAssistantPage.summary,
    steps: [
      "Reads up to ten unread Gmail threads from the last two days",
      "Summarizes each one and groups them by reply needed, waiting, or information only",
      "Drafts replies in chat for the three most urgent threads, and flags missing facts instead of guessing",
    ],
    waitsForYou: [
      "Saving a Gmail draft waits for approval unless an eligible rule allows it",
      "Sending always waits for your approval",
    ],
    apps: ["Gmail"],
    schedule: "On request, then as a routine once a run works",
    prompt: emailPrompt ?? "",
  },
]

export function findBotTemplate(id: string) {
  return botTemplates.find((template) => template.id === id)
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`)

// The working instructions a template bot starts with, built from its page.
export function botTemplateInstructions(template: BotTemplate) {
  return [
    `Your role, as the person read it before creating you: ${template.summary}`,
    `The work: ${template.steps.map(sentence).join(" ")}`,
    `What waits for the person: ${template.waitsForYou.map(sentence).join(" ")}`,
    `Your starting brief, which the person may change: ${JSON.stringify(template.prompt)} Swap in the apps, names, and thresholds they actually use, and ask only for a detail that would change the result.`,
    `Usual timing: ${sentence(template.schedule)} Do one run on request first; when the person likes the result, offer to repeat it with scheduleRoutine.`,
    workflowExecutionInstructions,
  ].join(" ")
}

export type StartingRole = {
  name: string
  job: string
  instructions: string
  avatar?: string
  /** A template's starter prompt, which the opening message proposes. */
  brief?: string
}

// What createBot accepts as presetId: a workspace preset or a page template.
export function findStartingRole(id: string): StartingRole | undefined {
  const preset = botPresets.find((preset) => preset.id === id)
  if (preset)
    return {
      name: preset.name,
      job: preset.job,
      instructions: preset.instructions,
    }
  const template = findBotTemplate(id)
  if (template)
    return {
      name: template.name,
      job: template.job,
      instructions: botTemplateInstructions(template),
      avatar: template.avatar,
      brief: template.prompt,
    }
}
