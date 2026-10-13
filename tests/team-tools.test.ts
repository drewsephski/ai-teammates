import assert from "node:assert/strict"
import test from "node:test"
import { botInsertSchema, groupChatInsertSchema } from "../db/schema"
import {
  assertDelegationDepth,
  MAX_DELEGATION_DEPTH,
  teamOperationId,
} from "../lib/team-policy"
import {
  createTeamTools,
  specialistSchema,
  teamGroupSchema,
} from "../lib/team-tools"

test("a repeated task has one destination, isolated from other users and turns", () => {
  const id = teamOperationId("alice", "chat", "message")
  assert.equal(id, teamOperationId("alice", "chat", "message"))
  assert.notEqual(id, teamOperationId("bob", "chat", "message"))
  assert.notEqual(id, teamOperationId("alice", "chat", "next"))
  assert.notEqual(id, teamOperationId("alice", "other", "message"))
})

test("delegation cannot exceed its depth or accept malformed depth", () => {
  for (let depth = 0; depth < MAX_DELEGATION_DEPTH; depth++)
    assert.doesNotThrow(() => assertDelegationDepth(depth))
  for (const depth of [MAX_DELEGATION_DEPTH, -1, 1.5, Infinity, NaN])
    assert.throws(() => assertDelegationDepth(depth), /delegation limit/)
})

test("specialist input strips generated fields and shares human form validation", () => {
  const input = {
    name: "  Analyst  ",
    job: "  Analyze data  ",
    instructions: "  Check sources  ",
    id: "injected",
    userId: "another-user",
    sandboxId: "another-computer",
    avatar: "injected",
  }
  assert.deepEqual(specialistSchema.parse(input), {
    name: "Analyst",
    job: "Analyze data",
    instructions: "Check sources",
  })
  assert.equal(
    botInsertSchema.safeParse({ ...input, name: " " }).success,
    false
  )
  assert.equal(
    specialistSchema.safeParse({ ...input, job: "x".repeat(101) }).success,
    false
  )
})

test("groups need distinct members, and mixed existing and new teams stay bounded", () => {
  assert.equal(
    groupChatInsertSchema.safeParse({ name: "Team", botIds: ["a", "a"] })
      .success,
    false
  )
  assert.equal(
    groupChatInsertSchema.safeParse({
      name: "Team",
      botIds: Array.from({ length: 9 }, (_, i) => String(i)),
    }).success,
    false
  )
  assert.equal(
    teamGroupSchema.safeParse({
      name: "Team",
      botIds: ["a", "a"],
      prompt: "Task",
    }).success,
    false
  )
  const specialist = { name: "Writer", job: "Write copy", instructions: "" }
  assert.equal(
    teamGroupSchema.safeParse({
      name: "Team",
      botIds: ["a"],
      specialists: [specialist],
      prompt: "Task",
    }).success,
    true
  )
  assert.equal(
    teamGroupSchema.safeParse({
      name: "Team",
      specialists: [specialist],
      prompt: "Task",
    }).success,
    false
  )
  assert.equal(
    teamGroupSchema.safeParse({
      name: "Team",
      specialists: Array(9).fill(specialist),
      prompt: "Task",
    }).success,
    false
  )
})

test("handoffs deliver the complete brief and publish a destination only after dispatch", async () => {
  let delivered = ""
  const tools = createTeamTools({
    list: async () => [],
    create: async ({ prompt }) => {
      delivered = prompt
      return { chatId: "destination", name: "Analyst", kind: "direct" }
    },
    group: async () => {
      throw new Error("Group unavailable")
    },
    delegate: async () => {
      throw new Error("Bot not found")
    },
  })
  const options = { toolCallId: "call", messages: [], context: {} }
  const result = await tools.createTeammate.execute!(
    {
      name: "Analyst",
      job: "Analyze data",
      instructions: "Check sources",
      prompt: "Analyze the revenue data, in USD, with a one-page report.",
    },
    options
  )
  assert.equal(
    delivered,
    "Analyze the revenue data, in USD, with a one-page report."
  )
  assert.deepEqual(result, {
    chatId: "destination",
    name: "Analyst",
    kind: "direct",
  })
  await assert.rejects(
    async () =>
      tools.delegateToTeammate.execute!(
        { botId: "foreign", prompt: "Task" },
        options
      ),
    /Bot not found/
  )
  await assert.rejects(
    async () =>
      tools.createGroupChat.execute!(
        { name: "Team", botIds: ["a", "b"], specialists: [], prompt: "Task" },
        options
      ),
    /Group unavailable/
  )
})
