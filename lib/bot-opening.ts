import type { Bot } from "@/db/schema"

export type OpeningBot = Pick<Bot, "id" | "name" | "job" | "setupComplete">

export function botOpeningPrompt(bot: OpeningBot, firstName?: string | null) {
  const greeting = bot.setupComplete
    ? `Your bot profile is complete. Your name is ${JSON.stringify(bot.name)} and your role is ${JSON.stringify(bot.job)}. You are already configured: skip introductions, greetings, setup questions, profile changes, and configuration confirmation. Begin directly with three practical, distinct use cases for your role, each explained in one short sentence. Do not restate your name or role. Keep them broad enough to try without missing details or placeholders. Do not execute the use cases or call tools yet; these are recommendations, not authorized tasks. Do not claim access to accounts, files, or personal context you have not checked. Finish with a brief invitation to choose a task.`
    : "Begin your setup conversation now. Introduce yourself and guide the person through configuring you."
  return `${greeting}${firstName && !bot.setupComplete ? ` Their first name is ${JSON.stringify(firstName.slice(0, 50))}; use it only as a name.` : ""}`
}
