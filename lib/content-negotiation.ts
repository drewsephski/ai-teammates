// Which representation an Accept header asks for. Pure, so proxy.ts and the
// tests share it.

function quality(accept: string, type: string) {
  let best = -1
  for (const part of accept.split(",")) {
    const [range, ...params] = part.trim().toLowerCase().split(";")
    const [main] = type.split("/")
    const matches = range === type || range === `${main}/*` || range === "*/*"
    if (!matches) continue
    const q = params
      .map((param) => param.trim())
      .find((param) => param.startsWith("q="))
    const value = q ? Number(q.slice(2)) : 1
    // An exact match outranks a wildcard, whatever their q values.
    if (range === type) return Number.isFinite(value) ? value : 0
    best = Math.max(best, Number.isFinite(value) ? value : 0)
  }
  return best
}

/**
 * True when the client names `text/markdown` and ranks it above HTML. Browsers
 * never send it, so pages stay HTML for people; agents that ask for Markdown
 * (`Accept: text/markdown, text/html;q=0.9`) get it.
 */
export function prefersMarkdown(accept: string | null) {
  if (!accept) return false
  const lower = accept.toLowerCase()
  if (!lower.includes("text/markdown")) return false
  const markdown = quality(lower, "text/markdown")
  const html = quality(lower, "text/html")
  if (markdown <= 0) return false
  if (markdown !== html) return markdown > html
  // A tie goes to whichever the client listed first.
  return (
    lower.indexOf("text/markdown") < lower.indexOf("text/html") ||
    lower.indexOf("text/html") === -1
  )
}
