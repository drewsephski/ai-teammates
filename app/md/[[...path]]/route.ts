import { absoluteUrl } from "@/lib/marketing/content"
import { markdownForPath } from "@/lib/marketing/markdown"

// Markdown copies of the public pages. Agents reach them either here or at the
// page's own URL with `Accept: text/markdown`, which proxy.ts rewrites to this
// route. The HTML page stays canonical.
export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params
  const pagePath = `/${(path ?? []).join("/")}`
  const markdown = markdownForPath(pagePath)
  if (markdown === null) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Link: `<${absoluteUrl(pagePath)}>; rel="canonical"`,
      Vary: "Accept",
      "X-Robots-Tag": "noindex",
    },
  })
}
