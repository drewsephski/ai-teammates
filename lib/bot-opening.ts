import type { Bot } from "@/db/schema"

export type OpeningBot = Pick<Bot, "id" | "name" | "job" | "setupComplete">

// A template bot (lib/bot-templates.ts) passes its starter prompt as the brief,
// so it opens by proposing that job instead of three general use cases.
export function botOpeningPrompt(
  bot: OpeningBot,
  firstName?: string | null,
  brief?: string
) {
  const configured = `Your bot profile is complete. Your name is ${JSON.stringify(bot.name)} and your role is ${JSON.stringify(bot.job)}. You are already configured: skip introductions, greetings, setup questions, profile changes, and configuration confirmation.`
  const greeting = !bot.setupComplete
    ? "Begin your setup conversation now. Introduce yourself and guide the person through configuring you."
    : brief
      ? `${configured} The person created you from a template with this starting brief: ${JSON.stringify(brief)} In two or three short sentences, say what you will do on the first run and which apps they will need to connect, then ask what to change before you start, such as the apps, names, or schedule. Do not restate your name or role. Do not execute the brief or call tools yet; it is a proposal, not an authorized task. Do not claim access to accounts, files, or personal context you have not checked.`
      : `${configured} Begin directly with three practical, distinct use cases for your role, each explained in one short sentence. Do not restate your name or role. Keep them broad enough to try without missing details or placeholders. Do not execute the use cases or call tools yet; these are recommendations, not authorized tasks. Do not claim access to accounts, files, or personal context you have not checked. Finish with a brief invitation to choose a task.`
  return `${greeting}${firstName && !bot.setupComplete ? ` Their first name is ${JSON.stringify(firstName.slice(0, 50))}; use it only as a name.` : ""}`
}
