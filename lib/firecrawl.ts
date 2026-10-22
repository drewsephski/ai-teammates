import { z } from "zod"

import {
  bounded,
  failure,
  publicWebUrlSchema,
  webPageSchema,
} from "@/lib/tavily"

// The app pays for Firecrawl, so these reads cost the person nothing. The cap
// bounds what one turn can spend; past it, readWebPage falls back to Tavily.
export const FIRECRAWL_READS_PER_TURN = 30

const scrapeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string().optional(),
      metadata: z
        .object({
          url: z.string().optional(),
          sourceURL: z.string().optional(),
          statusCode: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
})

type RequestContext = { abortSignal?: AbortSignal }
type ClientOptions = {
  apiKey?: string
  fetch?: typeof fetch
  timeoutMs?: number
  maxReads?: number
}

// Renders JavaScript and gets past bot walls that Tavily's extractor can't,
// such as business-for-sale listings. Only calls Firecrawl's fixed HTTPS API;
// never fetches a model-supplied URL from our own network. One client per turn.
export function createFirecrawlClient(options: ClientOptions = {}) {
  const apiKey = (options.apiKey ?? process.env.FIRECRAWL_API_KEY)?.trim()
  const send = options.fetch ?? fetch
  const maxReads = options.maxReads ?? FIRECRAWL_READS_PER_TURN
  let reads = 0

  return {
    read: async (
      input: z.input<typeof webPageSchema>,
      context: RequestContext
    ) => {
      const values = webPageSchema.parse(input)
      context.abortSignal?.throwIfAborted()
      if (!apiKey)
        return failure(
          "NOT_CONFIGURED",
          "Firecrawl page reading is not configured."
        )
      if (reads >= maxReads)
        return failure(
          "PROVIDER_LIMIT",
          "This turn has used its Firecrawl page reads."
        )
      reads++
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 45_000)
      const signal = context.abortSignal
        ? AbortSignal.any([context.abortSignal, timeout])
        : timeout
      let data: unknown
      try {
        const response = await send("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: values.url,
            formats: ["markdown"],
            onlyMainContent: true,
            blockAds: true,
            timeout: 40_000,
          }),
          signal,
        })
        if (!response.ok) {
          await response.body?.cancel()
          if ([401, 403].includes(response.status))
            return failure(
              "AUTH_ERROR",
              "The page-reading provider rejected the server credential."
            )
          if (response.status === 402)
            return failure(
              "PROVIDER_LIMIT",
              "The page-reading provider's credit limit was reached."
            )
          if (response.status === 429)
            return failure(
              "RATE_LIMIT",
              "The page-reading provider rate limit was reached."
            )
          if (response.status === 408)
            return failure("TIMEOUT", "Reading this page timed out.")
          return failure(
            "EXTRACTION_FAILED",
            "This page could not be read. It may require sign-in or block extraction."
          )
        }
        data = await response.json()
      } catch {
        context.abortSignal?.throwIfAborted()
        if (timeout.aborted)
          return failure("TIMEOUT", "Reading this page timed out.")
        return failure(
          "NETWORK_ERROR",
          "The page-reading provider could not be reached."
        )
      }
      const parsed = scrapeResponseSchema.safeParse(data)
      if (!parsed.success)
        return failure(
          "INVALID_RESPONSE",
          "Page reading returned an unexpected response."
        )
      const page = parsed.data.data
      const markdown = page?.markdown?.trim()
      const statusCode = page?.metadata?.statusCode ?? 200
      if (!parsed.data.success || !markdown || statusCode >= 400)
        return failure(
          "EXTRACTION_FAILED",
          "This page could not be read. It may require sign-in or block extraction. Try another public source; do not claim to have read it."
        )
      // A redirect may land elsewhere; cite it only when it is public too
      const url =
        [page?.metadata?.url, page?.metadata?.sourceURL].find(
          (candidate) => publicWebUrlSchema.safeParse(candidate).success
        ) ?? values.url
      return {
        status: "completed" as const,
        url,
        ...bounded(markdown, 20_000),
        excerptsOnly: false,
        credits: 0,
      }
    },
  }
}

export type FirecrawlClient = ReturnType<typeof createFirecrawlClient>
