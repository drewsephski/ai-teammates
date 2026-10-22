import { isIP } from "node:net"
import { z } from "zod"

// Public PAYG price, in the same millionths-of-a-dollar units as the AI ledger.
export const TAVILY_CREDIT_COST = 8_000
export function tavilyCost(credits: number) {
  return Math.ceil(credits * TAVILY_CREDIT_COST)
}

function publicUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !isIP(host) &&
      host.includes(".") &&
      !/(^|\.)(localhost|local|internal|test|invalid|arpa)$/.test(host)
    )
  } catch {
    return false
  }
}

export const publicWebUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine(
    publicUrl,
    "Use a public HTTP(S) URL without credentials or a custom port."
  )

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)
  .refine(
    (domain) => publicUrl(`https://${domain}`),
    "Use a public domain name."
  )
const querySchema = z.string().trim().min(1).max(400)
const depthSchema = z.enum(["basic", "advanced"])
const dateSchema = z.iso.date()

export const webSearchSchema = z
  .object({
    query: querySchema.describe(
      "A focused public-web query. Do not include private account data."
    ),
    maxResults: z.number().int().min(1).max(10).default(5),
    depth: depthSchema
      .default("basic")
      .describe("Use advanced only when basic results are insufficient."),
    topic: z.enum(["general", "news"]).default("general"),
    timeRange: z.enum(["day", "week", "month", "year"]).optional(),
    startDate: dateSchema.optional().describe("Date window start, YYYY-MM-DD."),
    endDate: dateSchema.optional().describe("Date window end, YYYY-MM-DD."),
    includeDomains: z.array(domainSchema).max(10).optional(),
    excludeDomains: z.array(domainSchema).max(10).optional(),
  })
  .refine(
    (input) =>
      !input.startDate || !input.endDate || input.startDate <= input.endDate,
    {
      message: "startDate must be on or before endDate.",
      path: ["endDate"],
    }
  )

export const webPageSchema = z.object({
  url: publicWebUrlSchema,
  query: querySchema
    .optional()
    .describe(
      "Optional focus question; returns relevant excerpts rather than the whole page."
    ),
  depth: depthSchema
    .default("basic")
    .describe("Use advanced for tables or content missed by basic extraction."),
})

const usageSchema = z.object({ credits: z.number().finite().nonnegative() })
const searchResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      score: z.number().finite().optional(),
      published_date: z.string().nullable().optional(),
    })
  ),
  usage: usageSchema.optional(),
})
const extractResponseSchema = z.object({
  results: z.array(z.object({ url: z.string(), raw_content: z.string() })),
  failed_results: z
    .array(z.object({ url: z.string(), error: z.string() }))
    .default([]),
  usage: usageSchema.optional(),
})

type FailureCode =
  | "NOT_CONFIGURED"
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "PROVIDER_LIMIT"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "EXTRACTION_FAILED"
export type WebFailure = {
  status: "failed"
  code: FailureCode
  message: string
}
export function failure(code: FailureCode, message: string): WebFailure {
  return { status: "failed", code, message }
}
export function bounded(text: string, limit: number) {
  return { content: text.slice(0, limit), truncated: text.length > limit }
}

type RequestContext = { toolCallId: string; abortSignal?: AbortSignal }
type ClientOptions = {
  apiKey?: string
  fetch?: typeof fetch
  timeoutMs?: number
  beforeRequest?: (maxCredits: number) => Promise<void>
  onUsage?: (credits: number, toolCallId: string) => Promise<void>
}

// Only calls Tavily's fixed HTTPS endpoints; never fetches a model-supplied URL
// from our own network. A client lives for one turn, sharing budget checks.
export function createTavilyClient(options: ClientOptions = {}) {
  const apiKey = (options.apiKey ?? process.env.TAVILY_API_KEY)?.trim()
  const send = options.fetch ?? fetch
  let pending: Promise<unknown> = Promise.resolve()

  function request(
    endpoint: "search" | "extract",
    body: Record<string, unknown>,
    maxCredits: number,
    context: RequestContext
  ) {
    const operation = pending.then(async () => {
      context.abortSignal?.throwIfAborted()
      if (!apiKey)
        return failure(
          "NOT_CONFIGURED",
          "Built-in web search is not configured. Ask the app administrator to configure Tavily."
        )
      await options.beforeRequest?.(maxCredits)
      context.abortSignal?.throwIfAborted()
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 35_000)
      const signal = context.abortSignal
        ? AbortSignal.any([context.abortSignal, timeout])
        : timeout
      let data: unknown
      let unreadable = false
      try {
        const response = await send(`https://api.tavily.com/${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...body, include_usage: true }),
          signal,
        })
        if (!response.ok) {
          await response.body?.cancel()
          if ([401, 403].includes(response.status))
            return failure(
              "AUTH_ERROR",
              "The web-search provider rejected the server credential. The app administrator needs to check it."
            )
          if (response.status === 429)
            return failure(
              "RATE_LIMIT",
              "The web-search provider rate limit was reached. Try again later."
            )
          if ([402, 432, 433].includes(response.status))
            return failure(
              "PROVIDER_LIMIT",
              "The web-search provider's credit or usage limit was reached."
            )
          return failure(
            "PROVIDER_ERROR",
            "The web-search provider could not complete this request. Try a different query or source."
          )
        }
        try {
          data = await response.json()
        } catch {
          // An accepted request may consume credits even if its body is invalid.
          if (signal.aborted) throw signal.reason
          unreadable = true
        }
      } catch {
        context.abortSignal?.throwIfAborted()
        if (timeout.aborted)
          return failure(
            "TIMEOUT",
            "The web-search request timed out. This source could not be verified."
          )
        return failure(
          "NETWORK_ERROR",
          "The web-search provider could not be reached. This request did not return verified sources."
        )
      }
      const usage = z.object({ usage: usageSchema }).safeParse(data)
      const credits = usage.success ? usage.data.usage.credits : maxCredits
      // Meter accepted requests before parsing results, including empty or
      // malformed results. Never return raw provider errors or response bodies.
      await options.onUsage?.(credits, context.toolCallId)
      if (unreadable)
        return failure(
          "INVALID_RESPONSE",
          "The web-search provider returned an unreadable response."
        )
      return { status: "completed" as const, data, credits }
    })
    pending = operation.catch(() => undefined)
    return operation
  }

  return {
    search: async (
      input: z.input<typeof webSearchSchema>,
      context: RequestContext
    ) => {
      const values = webSearchSchema.parse(input)
      const response = await request(
        "search",
        {
          query: values.query,
          max_results: values.maxResults,
          search_depth: values.depth,
          topic: values.topic,
          time_range: values.timeRange,
          start_date: values.startDate,
          end_date: values.endDate,
          include_domains: values.includeDomains,
          exclude_domains: values.excludeDomains,
          include_published_date: true,
          filter_by_published_date: Boolean(
            values.timeRange || values.startDate || values.endDate
          ),
          include_answer: false,
          include_raw_content: false,
          auto_parameters: false,
        },
        values.depth === "advanced" ? 2 : 1,
        context
      )
      if (response.status === "failed") return response
      const parsed = searchResponseSchema.safeParse(response.data)
      if (!parsed.success)
        return failure(
          "INVALID_RESPONSE",
          "Web search returned an unexpected response. No sources were verified."
        )
      return {
        status: "completed" as const,
        query: values.query,
        credits: response.credits,
        results: parsed.data.results
          .filter((result) => publicWebUrlSchema.safeParse(result.url).success)
          .slice(0, values.maxResults)
          .map((result) => ({
            title: result.title.slice(0, 500),
            url: result.url,
            ...bounded(result.content, 3_000),
            score: result.score,
            publishedDate: result.published_date?.slice(0, 100) ?? null,
          })),
      }
    },
    read: async (
      input: z.input<typeof webPageSchema>,
      context: RequestContext
    ) => {
      const values = webPageSchema.parse(input)
      const response = await request(
        "extract",
        {
          urls: [values.url],
          query: values.query,
          ...(values.query ? { chunks_per_source: 5 } : {}),
          extract_depth: values.depth,
          format: "markdown",
          timeout: 25,
        },
        values.depth === "advanced" ? 2 : 1,
        context
      )
      if (response.status === "failed") return response
      const parsed = extractResponseSchema.safeParse(response.data)
      if (!parsed.success)
        return failure(
          "INVALID_RESPONSE",
          "Page reading returned an unexpected response. No page content was verified."
        )
      const page = parsed.data.results.find(
        (result) =>
          publicWebUrlSchema.safeParse(result.url).success &&
          result.raw_content.trim()
      )
      if (!page)
        return failure(
          "EXTRACTION_FAILED",
          "This page could not be read. It may require sign-in or block extraction. Try another public source; do not claim to have read it."
        )
      return {
        status: "completed" as const,
        url: page.url,
        ...bounded(page.raw_content, 20_000),
        excerptsOnly: Boolean(values.query),
        credits: response.credits,
      }
    },
  }
}

export type TavilyClient = ReturnType<typeof createTavilyClient>
