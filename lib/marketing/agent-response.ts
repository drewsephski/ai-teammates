// Responses for the public discovery files under /.well-known. They describe
// public resources only, so any origin may read them.

const discoveryHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600",
}

export const discoveryJson = (
  body: unknown,
  contentType = "application/json"
) =>
  new Response(`${JSON.stringify(body, null, 2)}\n`, {
    headers: {
      ...discoveryHeaders,
      "Content-Type": `${contentType}; charset=utf-8`,
    },
  })

export const discoveryMarkdown = (body: string) =>
  new Response(body, {
    headers: {
      ...discoveryHeaders,
      "Content-Type": "text/markdown; charset=utf-8",
    },
  })
