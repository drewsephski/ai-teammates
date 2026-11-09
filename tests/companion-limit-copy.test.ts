import assert from "node:assert/strict"
import test from "node:test"

import {
  FREE_APP_LIMIT_ERROR,
  FREE_BOT_LIMIT_ERROR,
} from "../lib/billing-policy"
import { ROUTINE_LIMIT_ERROR } from "../lib/routine-policy"
import { computerTimeUsedUpMessage } from "../lib/sandbox-policy"

// A frozen copy of companionText from krafty-mobile src/lib/companion-policy.ts
// as shipped in iOS build 33 (c91e682). Installed builds can't change, so
// server limit messages must keep passing through this exact filter.
const KRAFTY_LIMIT =
  /^(?:The free plan includes one (?:bot|connected app|routine)\b|Your current plan includes one connected app\b|Memory is full: the free plan keeps \d+ memories\b|Your free computer time is used up\b|Your AI allowance is used up\b|You've used up your AI allowance\b)/i
const KRAFTY_PURCHASE =
  /\bupgrade(?:\s+\w+){0,3}\s+Krafty\b|kraftybot\.app\/pricing\b|(?:^|[\s([])\/pricing\b/i
const PURCHASE_PROMPT =
  /\bupgrade\s+(?:to\s+(?:schedule more|keep using the computer|add more teammates|connect another|continue)|or\s+wait)\b|\bupgrade(?:\s+\w+){0,3}\s+Krafty\b|kraftybot\.app\/pricing\b|(?:^|[\s([])\/pricing\b/i
const UPGRADE_OPTION =
  /,?\s+or\s+upgrade(?:\s+(?:first|now))?(?=\s+to\s+(?:connect|schedule|continue|keep using)\b|\s*[.!?]|\s*$)/gi

function installedCompanionText(text: string) {
  if (!KRAFTY_LIMIT.test(text) && !KRAFTY_PURCHASE.test(text)) return text
  const trimmed = KRAFTY_LIMIT.test(text)
    ? text.replace(UPGRADE_OPTION, "")
    : text
  if (!PURCHASE_PROMPT.test(trimmed)) return trimmed
  const sentences = trimmed.match(/\S[\s\S]*?(?:[.!?]+(?=\s|$)|$)/g) ?? []
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !PURCHASE_PROMPT.test(sentence))
    .join(" ")
}

test("installed iPhone builds strip the purchase prompt from every free-plan limit", () => {
  const cases: [string, string][] = [
    [FREE_BOT_LIMIT_ERROR, "The free plan includes three bots."],
    [
      FREE_APP_LIMIT_ERROR,
      "The free plan includes three connected apps. Disconnect one to connect another.",
    ],
    [ROUTINE_LIMIT_ERROR, "The free plan includes three routines."],
    [
      computerTimeUsedUpMessage("free"),
      "This month's free computer time is used up. It renews on the 1st.",
    ],
  ]
  for (const [message, shown] of cases) {
    assert.match(message, /upgrade/i)
    assert.equal(installedCompanionText(message), shown)
  }
})
