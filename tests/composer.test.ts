import assert from "node:assert/strict"
import test from "node:test"
import { composerInstructions, composerTrigger, parseComposerCommand, reconcileMentions, validateMentionRanges } from "../lib/composer"

test("commands are explicit leading tokens, not paths or quoted text", () => {
  assert.equal(parseComposerCommand(" /PLAN ship it")?.command?.name, "plan")
  assert.equal(parseComposerCommand(" /PLAN ship it")?.argument, "ship it")
  assert.equal(parseComposerCommand("/summarize")?.command?.name, "summarize")
  assert.equal(parseComposerCommand("/unknown do something")?.command, undefined)
  for (const text of ["Use /review later", "/usr/bin/node", "https://example.com/plan", "`/plan`"]) assert.equal(parseComposerCommand(text), undefined)
})

test("mention triggers respect caret, email boundaries and selected multiword names", () => {
  assert.equal(composerTrigger("name@example.com", 16, []), undefined)
  assert.deepEqual(composerTrigger("Ask @Data Analyst", 17, []), { kind: "mention", query: "data analyst", start: 4, end: 17 })
  assert.equal(composerTrigger("Ask @Data Analyst", 17, [{ botId: "a", start: 4, end: 17 }]), undefined)
  assert.deepEqual(composerTrigger("/rev", 4, []), { kind: "command", query: "rev", start: 0, end: 4 })
})

test("mention IDs survive edits around names and are dropped on edits inside names", () => {
  const text = "Ask @Alex about pricing"
  const mentions = [{ botId: "analyst", start: 4, end: 9 }]
  assert.deepEqual(reconcileMentions(text, "Please Ask @Alex about pricing", mentions), [{ botId: "analyst", start: 11, end: 16 }])
  assert.deepEqual(reconcileMentions(text, "Ask @Alex about revenue", mentions), mentions)
  for (const next of ["Ask @Alec about pricing", "Ask @Alexis about pricing", "Ask Alex about pricing", "Ask me@Alex about pricing", ""]) assert.deepEqual(reconcileMentions(text, next, mentions), [])
})

test("mention metadata refuses malformed ranges, overlap and excessive tags", () => {
  assert.deepEqual(validateMentionRanges("@Alex hi", [{ botId: "a", start: 0, end: 5 }]), [{ botId: "a", start: 0, end: 5 }])
  for (const value of [[{ botId: "a", start: 1, end: 5 }], [{ botId: "a", start: 0, end: 50 }], [{ botId: "a", start: 4, end: 2 }], [{ botId: "a", start: 0, end: 5 }, { botId: "b", start: 0, end: 3 }], Array(6).fill({ botId: "a", start: 0, end: 5 })]) assert.throws(() => validateMentionRanges("@Alex hi", value))
})

test("tagged IDs and slash intent reach agent instructions, with explicit execution boundaries", () => {
  const bots = [{ id: "analyst", name: "Alex", job: "Analyze pricing" }, { id: "writer", name: "Alex", job: "Write copy" }]
  const ask = composerInstructions("/ask @Alex check pricing", bots.slice(0, 1), "source")
  assert.match(ask, /consultTeammate/)
  assert.match(ask, /analyst/)
  assert.doesNotMatch(ask, /writer/)
  assert.match(ask, /never impersonate/)
  const handoff = composerInstructions("/delegate @Alex ship the report", bots.slice(0, 1), "source")
  assert.match(handoff, /delegateToTeammate/)
  assert.doesNotMatch(handoff, /For each tagged teammate/)
  assert.throws(() => composerInstructions("/ask question", [], "source"), /Tag a teammate/)
  assert.throws(() => composerInstructions("/delegate @Alex task", bots, "source"), /exactly one/)
  assert.throws(() => composerInstructions("/ask @Alex task", bots.slice(0, 1), "analyst"), /Tag a teammate/)
  assert.throws(() => composerInstructions("/unknown", [], "source"), /Unknown/)
  assert.match(composerInstructions("/plan launch", [], "source"), /does not authorize external execution/)
})
