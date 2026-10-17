import type { InboundEmail } from "@/lib/trigger-policy"

// Inbound mail, as the common providers post it, read into one shape. Pure:
// the route reads the request, this reads the fields. Supported:
// - Postmark inbound webhooks (JSON)
// - SendGrid Inbound Parse (multipart form)
// - Mailgun routes (multipart or urlencoded form)

// The address in `Name <ana@example.com>` or a bare address
export function emailAddressOf(value: string) {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(value)
  return (match?.[1] ?? value).trim().toLowerCase()
}

// Every address in a To/Cc style list
export function addressList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.includes("@"))
    .map(emailAddressOf)
}

// Mail without a text part still has something to read
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// The Message-ID in a block of raw headers
function messageIdHeader(headers: string) {
  return /^message-id:\s*(.+)$/im.exec(headers)?.[1]?.trim()
}

type PostmarkHeader = { Name?: unknown; Value?: unknown }
const str = (value: unknown) => (typeof value === "string" ? value : "")

function fromPostmark(body: Record<string, unknown>): InboundEmail | undefined {
  const fromFull = body.FromFull as { Email?: unknown } | undefined
  const from = str(fromFull?.Email) || emailAddressOf(str(body.From))
  const toFull = Array.isArray(body.ToFull)
    ? (body.ToFull as { Email?: unknown }[]).map((to) =>
        str(to.Email).toLowerCase()
      )
    : []
  const ccFull = Array.isArray(body.CcFull)
    ? (body.CcFull as { Email?: unknown }[]).map((cc) =>
        str(cc.Email).toLowerCase()
      )
    : []
  const to = [
    ...toFull,
    ...ccFull,
    ...addressList(str(body.OriginalRecipient)),
  ].filter(Boolean)
  if (!from || !to.length) return undefined
  const headers = Array.isArray(body.Headers)
    ? (body.Headers as PostmarkHeader[])
    : []
  const messageId = headers.find(
    (header) => str(header.Name).toLowerCase() === "message-id"
  )?.Value
  return {
    from: from.toLowerCase(),
    to: [...new Set(to)],
    subject: str(body.Subject),
    text: str(body.TextBody) || htmlToText(str(body.HtmlBody)),
    messageId: str(messageId) || str(body.MessageID) || undefined,
    date: str(body.Date) || undefined,
  }
}

function fromForm(form: Map<string, string>): InboundEmail | undefined {
  const get = (name: string) => form.get(name) ?? ""
  // SendGrid's envelope lists the actual recipients, Bcc included
  let envelope: { to?: unknown; from?: unknown } = {}
  try {
    envelope = JSON.parse(get("envelope") || "{}")
  } catch {
    envelope = {}
  }
  const envelopeTo = Array.isArray(envelope.to)
    ? envelope.to.map((to) => str(to).toLowerCase())
    : []
  const from = emailAddressOf(
    get("sender") || get("from") || str(envelope.from)
  )
  const to = [
    ...envelopeTo,
    ...addressList(get("recipient")),
    ...addressList(get("to")),
    ...addressList(get("cc")),
  ].filter(Boolean)
  if (!from || !to.length) return undefined
  return {
    from,
    to: [...new Set(to)],
    subject: get("subject"),
    text:
      get("text") ||
      get("body-plain") ||
      htmlToText(get("html") || get("body-html")),
    messageId:
      get("Message-Id") || messageIdHeader(get("headers")) || undefined,
    date: get("Date") || undefined,
  }
}

export function parseInboundEmail(
  input: { json: unknown } | { form: Map<string, string> }
) {
  if ("form" in input) return fromForm(input.form)
  if (!input.json || typeof input.json !== "object") return undefined
  return fromPostmark(input.json as Record<string, unknown>)
}

// The trigger tokens this mail is for: recipients on the inbound domain
export function recipientTokens(email: InboundEmail, domain: string) {
  return [
    ...new Set(
      email.to.flatMap((address) => {
        const at = address.lastIndexOf("@")
        return address.slice(at + 1) === domain
          ? [address.slice(0, at).split("+")[0]]
          : []
      })
    ),
  ]
}
