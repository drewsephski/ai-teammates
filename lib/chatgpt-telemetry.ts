import type { Event } from "@sentry/nextjs"

function privateAuthUrl(value: string) {
  return value.includes("/api/chatgpt/") || value.includes("auth.openai.com/")
}

function cleanUrl(value: string) {
  try {
    const url = new URL(value)
    if (privateAuthUrl(value)) url.search = ""
    return url.toString()
  } catch {
    return "[redacted auth URL]"
  }
}

// OAuth codes and one-time tickets must not reach error reporting, including
// the local-variable capture enabled elsewhere in this development project.
export function redactChatGPTEvent<T extends Event>(event: T): T {
  const authRequest = event.request?.url && privateAuthUrl(event.request.url)
  if (authRequest && event.request) {
    event.request.url = cleanUrl(event.request.url!)
    event.request.data = undefined
    event.request.cookies = undefined
    event.request.headers = undefined
    event.request.query_string = undefined
  }
  const authStack = event.exception?.values?.some((exception) =>
    exception.stacktrace?.frames?.some((frame) =>
      frame.filename?.includes("chatgpt")
    )
  )
  if (authRequest || authStack)
    for (const exception of event.exception?.values ?? [])
      for (const frame of exception.stacktrace?.frames ?? [])
        frame.vars = undefined
  for (const breadcrumb of event.breadcrumbs ?? []) {
    const url = breadcrumb.data?.url
    if (typeof url === "string" && privateAuthUrl(url))
      breadcrumb.data = {
        url: cleanUrl(url),
        status_code: breadcrumb.data?.status_code,
      }
  }
  for (const span of event.spans ?? [])
    for (const [key, value] of Object.entries(span.data ?? {}))
      if (typeof value === "string" && privateAuthUrl(value))
        span.data![key] = cleanUrl(value)
  return event
}
