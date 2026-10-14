import { z } from "zod"

export const forYouSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(280),
  prompt: z.string().trim().min(1).max(1200),
  botId: z.string().min(1).max(128),
  toolkit: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
  sourceId: z.string().min(1).max(500),
  sourceQuote: z.string().trim().min(8).max(240),
})
export type ForYouSuggestion = z.infer<typeof forYouSuggestionSchema>
export const forYouOutputSchema = z.object({
  suggestion: forYouSuggestionSchema.nullable(),
})

const recordIdKey =
  /^(?:id|message_?id|thread_?id|issue_?id|record_?id|document_?id|file_?id|url|html_url|web_url)$/i
const recordTextKey =
  /^(?:name|title|subject|snippet|preview|description|summary|text|plain_?text|content|body|message_?text|sender|from|to|date|start|end|due_?date|message_?timestamp|modified_?time)$/i

type SourceRecord = { toolkit: string; sourceId: string; text: string[] }

// Send complete, small records from every app to the formatter. Raw provider
// JSON includes MIME payloads and logs; slicing it can erase later apps entirely.
export function forYouSourceRecords(reads: unknown[]): SourceRecord[] {
  const records = new Map<string, SourceRecord>()
  function visit(value: unknown, toolkit: string) {
    if (!value || typeof value !== "object") return
    const entries = Object.entries(value)
    const id = entries.find(
      ([key, id]) =>
        recordIdKey.test(key) && typeof id === "string" && id.length <= 500
    )
    if (id) {
      const text: string[] = []
      function collect(value: unknown, textField = false) {
        if (typeof value === "string") {
          if (textField && value.trim()) {
            text.push(value.slice(0, 1000))
            if (value.length > 1000) text.push(value.slice(-1000))
          }
          return
        }
        if (!value || typeof value !== "object" || text.length >= 6) return
        for (const [key, nested] of Object.entries(value)) {
          // A child record belongs to its own source ID, never its parent.
          if (
            nested &&
            typeof nested === "object" &&
            Object.keys(nested).some((key) => recordIdKey.test(key))
          )
            continue
          collect(
            nested,
            recordTextKey.test(key) || (Array.isArray(value) && textField)
          )
          if (text.length >= 6) break
        }
      }
      collect(value)
      if (text.length) {
        const sourceId = String(id[1])
        const key = `${toolkit}:${sourceId}`
        // A later detailed read supersedes a search/list preview of this record.
        records.delete(key)
        records.set(key, {
          toolkit,
          sourceId,
          text: [...new Set(text)].slice(0, 6),
        })
      }
    }
    for (const [, nested] of entries) visit(nested, toolkit)
  }
  for (const read of reads) {
    if (
      read &&
      typeof read === "object" &&
      "status" in read &&
      read.status === "succeeded" &&
      "toolkit" in read &&
      typeof read.toolkit === "string" &&
      "data" in read
    )
      visit(read.data, read.toolkit)
  }
  const apps = new Map<string, SourceRecord[]>()
  for (const record of [...records.values()].reverse()) {
    const group = apps.get(record.toolkit) ?? []
    group.push(record)
    apps.set(record.toolkit, group)
  }
  const result: SourceRecord[] = []
  // Round-robin prevents a large inbox from consuming the document budget.
  for (let index = 0; index < 10; index++) {
    for (const group of apps.values()) {
      const record = group[index]
      if (record && JSON.stringify([...result, record]).length <= 24_000)
        result.push(record)
    }
  }
  return result
}

// Match a record and quote from a successful read of the selected app.
export function isGroundedSuggestion(
  suggestion: ForYouSuggestion,
  reads: unknown[]
) {
  function containsQuote(value: unknown): boolean {
    if (typeof value === "string") return value.includes(suggestion.sourceQuote)
    if (!value || typeof value !== "object") return false
    return Object.values(value).some(containsQuote)
  }
  function containsRecord(value: unknown): boolean {
    if (!value || typeof value !== "object") return false
    const entries = Object.entries(value)
    if (
      entries.some(
        ([key, id]) =>
          recordIdKey.test(key) && String(id) === suggestion.sourceId
      ) &&
      containsQuote(value)
    )
      return true
    return entries.some(([, nested]) => containsRecord(nested))
  }
  return reads.some(
    (read) =>
      read &&
      typeof read === "object" &&
      "status" in read &&
      read.status === "succeeded" &&
      "toolkit" in read &&
      read.toolkit === suggestion.toolkit &&
      "data" in read &&
      containsRecord(read.data)
  )
}
