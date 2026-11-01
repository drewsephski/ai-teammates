import { z } from "zod"

import { reviewRating } from "@/lib/review-records"
import {
  bounded,
  failure,
  publicWebUrlSchema,
  webPageSchema,
  type WebFailure,
} from "@/lib/tavily"

// Context.dev's Developer-plan overage, $3 per 1,000 credits, in the same
// millionths-of-a-dollar units as the AI ledger. Bought on a bigger plan the
// credit is cheaper; the person is charged this rate either way.
export const CONTEXT_DEV_CREDIT_COST = 3_000
export function contextDevCost(credits: number) {
  return Math.ceil(credits * CONTEXT_DEV_CREDIT_COST)
}

// What a request may cost, checked against the allowance before it is sent.
// A Markdown read is one credit. Context.dev prices its store, review and
// social parsers "from 1 credit", so they reserve more; the charge is always
// what the response reports.
export const CONTEXT_DEV_READ_CREDITS = 1
export const CONTEXT_DEV_PARSER_CREDITS = 5

// Reviews and posts age fast, so parser results may be an hour old at most.
// A page read accepts a day-old copy.
const PARSER_MAX_AGE_MS = 60 * 60 * 1000
const PAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000

export const reviewParsers = {
  "app-store": "app-store-reviews",
  "google-play": "google-play-reviews",
  g2: "g2-reviews",
  yelp: "yelp-reviews",
  "google-maps": "google-maps-reviews",
} as const
export type ReviewSource = keyof typeof reviewParsers

export const socialParsers = [
  "instagram-profile",
  "instagram-post",
  "instagram-feed",
  "tiktok-profile",
  "tiktok-video",
  "tiktok-feed",
  "tiktok-comments",
  "tiktok-user-search",
] as const
export type SocialParser = (typeof socialParsers)[number]
type Parser = (typeof reviewParsers)[ReviewSource] | SocialParser

function hostOf(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "")
}

// Which review parser reads a URL, from the URL forms context.dev documents.
export function reviewSourceFor(value: string): ReviewSource | undefined {
  const url = new URL(value)
  const host = hostOf(url)
  const path = url.pathname
  if (host === "apps.apple.com" && /\/app\/(?:[^/]+\/)?id\d+/.test(path))
    return "app-store"
  if (
    host === "play.google.com" &&
    path.startsWith("/store/apps/details") &&
    url.searchParams.get("id")
  )
    return "google-play"
  if (host === "g2.com" && path.startsWith("/products/")) return "g2"
  if (
    /^(?:[a-z]{2}\.)?(?:m\.)?yelp\.[a-z.]+$/.test(host) &&
    /^\/biz\//.test(path)
  )
    return "yelp"
  if (
    ((host === "google.com" || /^google\.[a-z.]+$/.test(host)) &&
      path.startsWith("/maps")) ||
    host === "maps.google.com" ||
    (host === "search.google.com" && path.startsWith("/local/reviews"))
  )
    return "google-maps"
}

export type SocialView = "overview" | "posts" | "comments"

// Which social parser reads a URL. Follower and following lists are left out
// on purpose: the bot studies what people say, not who they are.
export function socialParserFor(
  value: string,
  view: SocialView = "overview"
): SocialParser | undefined {
  const url = new URL(value)
  const host = hostOf(url)
  const path = url.pathname.replace(/\/+$/, "")
  if (host === "instagram.com") {
    if (/^\/(?:[^/]+\/)?(?:p|reel|reels)\/[^/]+$/.test(path))
      return "instagram-post"
    if (/^\/(?:explore\/tags|explore\/locations|popular)\//.test(path))
      return "instagram-feed"
    if (
      /^\/[A-Za-z0-9._]+$/.test(path) &&
      !/^\/(?:explore|accounts|direct|stories)$/.test(path)
    )
      return "instagram-profile"
    return undefined
  }
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    if (/^\/@[^/]+\/(?:video|photo)\/\d+$/.test(path))
      return view === "comments" ? "tiktok-comments" : "tiktok-video"
    if (path === "/search/user" && url.searchParams.get("q"))
      return "tiktok-user-search"
    if (
      /^\/tag\/[^/]+$/.test(path) ||
      (path === "/search" && url.searchParams.get("q"))
    )
      return "tiktok-feed"
    if (/^\/@[^/]+$/.test(path))
      return view === "posts" ? "tiktok-feed" : "tiktok-profile"
  }
}

// Provider records carry media URLs, avatars and ids the model doesn't need.
// Keep the text and numbers, capped, and only public http(s) links.
const droppedKey =
  /image|avatar|thumbnail|photo|media|_pic|^pic|^icon|video_url|^cover|sec_uid|^id$|_id$|^featureId$|^cid$/i
export function compact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") {
    const text = value.trim()
    if (!text) return undefined
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text))
      return publicWebUrlSchema.safeParse(text).success ? text : undefined
    return text.length > 1_500 ? `${text.slice(0, 1_500)}…` : text
  }
  if (depth >= 4) return undefined
  if (Array.isArray(value)) {
    const items = value
      .slice(0, 12)
      .map((item) => compact(item, depth + 1))
      .filter((item) => item !== undefined)
    return items.length ? items : undefined
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([key]) => !droppedKey.test(key))
      .map(([key, item]) => [key, compact(item, depth + 1)] as const)
      .filter(([, item]) => item !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return undefined
}

// Keeps whole records, in order, until the next would pass the limit
export function boundedList(items: unknown[], limit: number) {
  const kept: unknown[] = []
  let size = 2
  for (const item of items) {
    const length = JSON.stringify(item).length + 1
    if (size + length > limit) break
    kept.push(item)
    size += length
  }
  return { items: kept, truncated: kept.length < items.length }
}

const MAX_REVIEW_CHARS = 40_000
const MAX_SOCIAL_CHARS = 30_000

export const reviewsSchema = z
  .object({
    url: publicWebUrlSchema.describe(
      "A competitor's review page: an App Store app (apps.apple.com/<country>/app/…/id…), a Google Play app (play.google.com/store/apps/details?id=…), a G2 product (g2.com/products/…), a Yelp business (yelp.com/biz/…) or a Google Maps place."
    ),
    minRating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Keep reviews rated at least this many stars."),
    maxRating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe(
        "Keep reviews rated at most this many stars; 2 for complaints."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(60)
      .describe("Most reviews to return after filtering, newest first."),
    sort: z
      .enum(["newest", "relevant", "highest", "lowest"])
      .default("newest")
      .describe("Google Maps only. Other sources always return newest first."),
  })
  .refine(
    (input) =>
      !input.minRating ||
      !input.maxRating ||
      input.minRating <= input.maxRating,
    { message: "minRating must not be above maxRating.", path: ["maxRating"] }
  )
  .refine((input) => reviewSourceFor(input.url) !== undefined, {
    message:
      "Use an App Store, Google Play, G2, Yelp or Google Maps review page URL.",
    path: ["url"],
  })

export const socialSchema = z
  .object({
    url: publicWebUrlSchema.describe(
      "A public Instagram profile, post, reel, hashtag or location page, or a TikTok profile, video, hashtag (tiktok.com/tag/…), search (tiktok.com/search?q=…) or user search (tiktok.com/search/user?q=…). No short links."
    ),
    view: z
      .enum(["overview", "posts", "comments"])
      .default("overview")
      .describe(
        "TikTok only: posts lists a profile's latest videos, comments reads a video's first comments. Instagram profiles include their latest posts and Instagram posts their top comments."
      ),
  })
  .refine((input) => socialParserFor(input.url, input.view) !== undefined, {
    message:
      "Use a public Instagram or TikTok profile, post, video, hashtag or search URL.",
    path: ["url"],
  })

const outputSchema = z
  .object({
    success: z.boolean().nullable().optional(),
    error_code: z.string().optional(),
    data: z.unknown().optional(),
  })
  .partial()

// A parser that failed on context.dev's side, which a retry may fix. Only the
// code is read; the provider's message never reaches the model.
function temporaryFailure(output?: z.infer<typeof outputSchema>) {
  if (
    output?.success === false &&
    /INTERNAL|TEMPORAR|TIMEOUT|UNAVAILABLE|RATE/i.test(output.error_code ?? "")
  )
    return failure(
      "PROVIDER_ERROR",
      "The data provider had a temporary error reading this page, and it wasn't charged. Try once more; if it fails again, use another source."
    )
}
const scrapeResponseSchema = z.object({
  url: z.string().optional(),
  markdown: outputSchema.optional(),
  parsed: outputSchema.optional(),
  key_metadata: z
    .object({ credits_consumed: z.number().finite().nonnegative() })
    .optional(),
})
type ScrapeResponse = z.infer<typeof scrapeResponseSchema>

type RequestContext = { toolCallId: string; abortSignal?: AbortSignal }
type ClientOptions = {
  apiKey?: string
  fetch?: typeof fetch
  timeoutMs?: number
  beforeRequest?: (maxCredits: number) => Promise<void>
  onUsage?: (credits: number, toolCallId: string) => Promise<void>
}

// Only calls context.dev's fixed HTTPS API; never fetches a model-supplied URL
// from our own network. Billed to the person's AI allowance at the credits
// each response reports. One client per turn, so budget checks serialize.
export function createContextDevClient(options: ClientOptions = {}) {
  const apiKey = (options.apiKey ?? process.env.CONTEXT_DEV_API_KEY)?.trim()
  const send = options.fetch ?? fetch
  let pending: Promise<unknown> = Promise.resolve()

  function scrape(
    body: Record<string, unknown>,
    maxCredits: number,
    succeeded: (data: ScrapeResponse) => boolean,
    context: RequestContext
  ): Promise<
    WebFailure | { status: "completed"; data: ScrapeResponse; credits: number }
  > {
    const operation = pending.then(async () => {
      context.abortSignal?.throwIfAborted()
      if (!apiKey)
        return failure(
          "NOT_CONFIGURED",
          "Review and social data are not configured. Ask the app administrator to configure context.dev."
        )
      await options.beforeRequest?.(maxCredits)
      context.abortSignal?.throwIfAborted()
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000)
      const signal = context.abortSignal
        ? AbortSignal.any([context.abortSignal, timeout])
        : timeout
      let data: unknown
      let header: string | null = null
      try {
        const response = await send("https://api.context.dev/v1/web/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...body,
            timeoutOpts: { milliseconds: 50_000, behavior: "fail" },
            tags: ["krafty"],
          }),
          signal,
        })
        // Context.dev charges only for 2xx responses
        if (!response.ok) {
          await response.body?.cancel()
          if ([401, 403].includes(response.status))
            return failure(
              "AUTH_ERROR",
              "The data provider rejected the server credential. The app administrator needs to check it."
            )
          if (response.status === 402)
            return failure(
              "PROVIDER_LIMIT",
              "The data provider's credit limit was reached."
            )
          if (response.status === 429)
            return failure(
              "RATE_LIMIT",
              "The data provider rate limit was reached. Try again later."
            )
          if (response.status === 408)
            return failure("TIMEOUT", "Reading this source timed out.")
          if ([400, 404, 410, 422].includes(response.status))
            return failure(
              "EXTRACTION_FAILED",
              "This source could not be read. Check that the URL is a public page of the supported kind."
            )
          return failure(
            "PROVIDER_ERROR",
            "The data provider could not complete this request. Try again or use another source."
          )
        }
        header = response.headers.get("X-Credits-Used")
        try {
          data = await response.json()
        } catch {
          if (signal.aborted) throw signal.reason
        }
      } catch {
        context.abortSignal?.throwIfAborted()
        if (timeout.aborted)
          return failure("TIMEOUT", "Reading this source timed out.")
        return failure(
          "NETWORK_ERROR",
          "The data provider could not be reached. Nothing was read."
        )
      }
      const parsed = scrapeResponseSchema.safeParse(data)
      const fromHeader =
        header !== null && header.trim() && Number.isFinite(Number(header))
          ? Number(header)
          : undefined
      const reported =
        (parsed.success
          ? parsed.data.key_metadata?.credits_consumed
          : undefined) ?? fromHeader
      // Without a reported figure, charge the reservation for a usable
      // result and nothing for one where every output failed, which
      // context.dev doesn't bill
      const ok = parsed.success && succeeded(parsed.data)
      const credits = reported ?? (ok || !parsed.success ? maxCredits : 0)
      if (credits > 0) await options.onUsage?.(credits, context.toolCallId)
      if (!parsed.success)
        return failure(
          "INVALID_RESPONSE",
          "The data provider returned an unexpected response. Nothing was verified."
        )
      return { status: "completed" as const, data: parsed.data, credits }
    })
    pending = operation.catch(() => undefined)
    return operation
  }

  function parse(
    url: string,
    parser: Parser,
    extra: Record<string, unknown>,
    context: RequestContext
  ) {
    return scrape(
      {
        url,
        formats: { parse: true },
        parseParams: { type: "prebuilt", parser, ...extra },
        maxAgeMs: PARSER_MAX_AGE_MS,
      },
      CONTEXT_DEV_PARSER_CREDITS,
      (data) => data.parsed?.success === true,
      context
    )
  }

  return {
    // readWebPage's reader for pages Firecrawl couldn't, before Tavily
    read: async (
      input: z.input<typeof webPageSchema>,
      context: RequestContext
    ) => {
      const values = webPageSchema.parse(input)
      const response = await scrape(
        {
          url: values.url,
          formats: { markdown: true },
          sharedParams: { mainContentOnly: true, dismissPopups: true },
          maxAgeMs: PAGE_MAX_AGE_MS,
        },
        CONTEXT_DEV_READ_CREDITS,
        (data) => data.markdown?.success === true,
        context
      )
      if (response.status === "failed") return response
      const markdown =
        response.data.markdown?.success === true &&
        typeof response.data.markdown.data === "string"
          ? response.data.markdown.data.trim()
          : ""
      if (!markdown)
        return failure(
          "EXTRACTION_FAILED",
          "This page could not be read. It may require sign-in or block extraction. Try another public source; do not claim to have read it."
        )
      const url = publicWebUrlSchema.safeParse(response.data.url).success
        ? response.data.url!
        : values.url
      return {
        status: "completed" as const,
        url,
        ...bounded(markdown, 20_000),
        excerptsOnly: false,
        credits: response.credits,
      }
    },
    reviews: async (
      input: z.input<typeof reviewsSchema>,
      context: RequestContext
    ) => {
      const values = reviewsSchema.parse(input)
      const source = reviewSourceFor(values.url)!
      const response = await parse(
        values.url,
        reviewParsers[source],
        source === "google-maps"
          ? { sort: values.sort, limit: Math.min(1_000, values.limit * 3) }
          : {},
        context
      )
      if (response.status === "failed") return response
      const reviewData = z
        .looseObject({ reviews: z.array(z.unknown()) })
        .safeParse(response.data.parsed?.data)
      const temporary = temporaryFailure(response.data.parsed)
      if (temporary) return temporary
      if (response.data.parsed?.success !== true || !reviewData.success)
        return failure(
          "EXTRACTION_FAILED",
          "No reviews could be read from this page. Check the URL, or try the competitor's page on another review site; do not claim to have read reviews."
        )
      const { reviews: all, ...about } = reviewData.data
      const matching = all.filter((review) => {
        const rating = reviewRating(review)
        if (rating === undefined) return !values.minRating && !values.maxRating
        return (
          rating >= (values.minRating ?? 0) && rating <= (values.maxRating ?? 5)
        )
      })
      const shown = boundedList(
        matching
          .slice(0, values.limit)
          .map((review) => compact(review))
          .filter(Boolean),
        MAX_REVIEW_CHARS
      )
      return {
        status: "completed" as const,
        source,
        url: values.url,
        fetched: all.length,
        matching: matching.length,
        returned: shown.items.length,
        truncated: shown.truncated || matching.length > values.limit,
        about: compact(about),
        reviews: shown.items,
        credits: response.credits,
      }
    },
    social: async (
      input: z.input<typeof socialSchema>,
      context: RequestContext
    ) => {
      const values = socialSchema.parse(input)
      const parser = socialParserFor(values.url, values.view)!
      const response = await parse(values.url, parser, {}, context)
      if (response.status === "failed") return response
      const data = response.data.parsed?.data
      const temporary = temporaryFailure(response.data.parsed)
      if (temporary) return temporary
      if (response.data.parsed?.success !== true || !data)
        return failure(
          "EXTRACTION_FAILED",
          "Nothing could be read from this page. It may be private, removed or a short link; do not claim to have read it."
        )
      const record = compact(data)
      const text = JSON.stringify(record ?? null)
      const truncated = text.length > MAX_SOCIAL_CHARS
      return {
        status: "completed" as const,
        platform: parser.split("-")[0] as "instagram" | "tiktok",
        parser,
        url: values.url,
        // Whole records when they fit; a capped JSON string when they don't
        data: truncated ? text.slice(0, MAX_SOCIAL_CHARS) : record,
        truncated,
        credits: response.credits,
      }
    },
  }
}

export type ContextDevClient = ReturnType<typeof createContextDevClient>
