// Browser-safe helpers for review records from context.dev's parsers, shared
// by lib/context-dev.ts and the chat's tool card.

// A review's star rating, under whichever name the parser uses
export function reviewRating(review: unknown) {
  if (!review || typeof review !== "object") return undefined
  for (const key of ["rating", "score", "stars", "star_rating", "nps_score"]) {
    const value = (review as Record<string, unknown>)[key]
    const rating = typeof value === "string" ? Number(value) : value
    if (typeof rating === "number" && Number.isFinite(rating)) return rating
  }
}
