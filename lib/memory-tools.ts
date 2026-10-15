import { tool } from "ai"
import { z } from "zod"

import {
  countActiveMemories,
  deleteMemory,
  getValidMemory,
  searchMemories,
  supersedeMemory,
  writeMemory,
} from "@/lib/memory"
import { FREE_MEMORY_LIMIT } from "@/lib/memory-policy"

const memoryText = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .describe(
    "One self-contained sentence in the third person that makes sense without this conversation, e.g. 'Prefers bullet summaries under 150 words.'"
  )

// Memory lives in Postgres and is shared by every teammate, on every plan.
// getBotId is asked on each call, so a handoff moves bot-scoped writes with it.
export function createMemoryTools({
  userId,
  chatId,
  getBotId,
  free,
  includeSensitive = true,
}: {
  userId: string
  chatId?: string
  getBotId: () => string
  free: boolean
  // Off for consultations, which never see sensitive memories
  includeSensitive?: boolean
}) {
  // A teammate may only change what it can see: shared memories and its own
  async function visibleMemory(memoryId: string) {
    const row = await getValidMemory(userId, memoryId)
    if (!row || (row.botId !== null && row.botId !== getBotId()))
      throw new Error(`No memory with id ${memoryId}.`)
    return row
  }

  return {
    recall: tool({
      description:
        "Search what you and the person's other teammates remember about them from earlier conversations: their role, preferences, people, projects, commitments and how they want work done. The <memory> block in your instructions already holds the most relevant memories; call this when it does not cover what you need, and always before saying you do not know something about the person or asking them to repeat it.",
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .describe("What you want to know, in a few words"),
      }),
      execute: async ({ query }) => {
        const rows = await searchMemories({
          userId,
          botId: getBotId(),
          query,
          includeSensitive,
        })
        return {
          memories: rows.map((row) => ({
            id: row.id,
            kind: row.kind,
            content: row.content,
            scope: row.botId ? ("this teammate" as const) : ("all" as const),
            reinforcedAt: row.reinforcedAt.toISOString(),
          })),
        }
      },
    }),

    remember: tool({
      description:
        "Save a memory so that you and the person's other teammates know it in every later conversation. Call this whenever they ask you to remember something, and when you learn something durable and useful later: who they are and what they work on, their preferences, people they work with, projects, things they committed to, or how they want you to do your job. Saying you will remember does nothing unless you call this. Never save secrets, passwords or card numbers, small talk, one-off task details, or sensitive personal categories unless they explicitly ask. If a memory in the <memory> block says the same thing differently, call updateMemory instead.",
      inputSchema: z.object({
        content: memoryText,
        kind: z
          .enum([
            "profile",
            "preference",
            "person",
            "project",
            "procedure",
            "commitment",
          ])
          .describe(
            "profile: who they are (role, company, timezone). preference: how they like things. person: someone they work with. project: ongoing work. procedure: how this teammate should do its job. commitment: something they said they would do, with a date."
          ),
        scope: z
          .enum(["all", "this"])
          .describe(
            "all: a fact about the person that every teammate should know. this: only about how you, this teammate, do your job."
          ),
        importance: z
          .number()
          .int()
          .min(7)
          .max(10)
          .default(7)
          .describe("7 for useful, 10 for essential"),
        dueAt: z.iso
          .datetime({ offset: true })
          .optional()
          .describe("For a commitment: when it is due, as an ISO date-time"),
      }),
      execute: async ({ content, kind, scope, importance, dueAt }) => {
        if (free && (await countActiveMemories(userId)) >= FREE_MEMORY_LIMIT)
          throw new Error(
            `Memory is full: the free plan keeps ${FREE_MEMORY_LIMIT} memories. The person can delete some on the Memory page or upgrade.`
          )
        const row = await writeMemory({
          userId,
          botId: scope === "this" ? getBotId() : null,
          kind,
          content,
          importance,
          confidence: 1,
          source: "explicit",
          actor: "agent",
          chatId,
          dueAt: dueAt ? new Date(dueAt) : null,
        })
        return { memoryId: row.id, remembered: row.content, scope }
      },
    }),

    updateMemory: tool({
      description:
        "Correct or update a memory that is out of date or wrong, by its id from the <memory> block or recall. The old version is kept as history. Use this when the person tells you something that changes what you remembered.",
      inputSchema: z.object({
        memoryId: z.string().min(1),
        content: memoryText,
      }),
      execute: async ({ memoryId, content }) => {
        await visibleMemory(memoryId)
        const row = await supersedeMemory({
          userId,
          memoryId,
          content,
          actor: "agent",
          chatId,
        })
        return { memoryId: row.id, remembered: row.content }
      },
    }),

    forget: tool({
      description:
        "Permanently delete a memory when the person asks you to forget something. Pass its id from the <memory> block or recall, or a query to forget the closest match.",
      inputSchema: z.object({
        memoryId: z.string().min(1).optional(),
        query: z.string().trim().min(1).max(500).optional(),
      }),
      execute: async ({ memoryId, query }) => {
        let id = memoryId
        if (!id && query) {
          const [match] = await searchMemories({
            userId,
            botId: getBotId(),
            query,
            limit: 1,
          })
          if (!match || match.cosine < 0.5)
            throw new Error("No saved memory matches that.")
          id = match.id
        }
        if (!id) throw new Error("Pass a memoryId or a query.")
        await visibleMemory(id)
        const deleted = await deleteMemory(userId, id)
        if (!deleted) throw new Error(`No memory with id ${id}.`)
        return { forgotten: deleted.content }
      },
    }),
  }
}

export type MemoryTools = ReturnType<typeof createMemoryTools>
