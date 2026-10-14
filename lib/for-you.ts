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
          /^(?:id|message_?id|thread_?id|issue_?id|record_?id|url|html_url|web_url)$/i.test(
            key
          ) && String(id) === suggestion.sourceId
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
