import { z } from "zod"

export const EMAIL_CHANGED_ERROR =
  "This email changed on another device. Reload it before continuing."
const addresses = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) =>
      !value ||
      value
        .split(/[,;]/)
        .every((address) => z.email().safeParse(address.trim()).success),
    "Enter email addresses separated by commas."
  )
export const emailContentSchema = z.object({
  to: addresses.refine((value) => !!value, "Add a recipient."),
  cc: addresses,
  bcc: addresses,
  subject: z.string().trim().min(1, "Add a subject.").max(998),
  body: z.string().min(1, "Write your email.").max(100_000),
})
export type EmailContent = z.infer<typeof emailContentSchema>
export const emailContextSchema = z.object({
  subject: z
    .string()
    .trim()
    .max(998)
    .optional()
    .describe(
      "Verified reply subject, when the reply tool inherits its subject from the thread."
    ),
  from: z
    .email()
    .optional()
    .describe(
      "Only the sender verified from the connected account; omit if unknown."
    ),
  inReplyTo: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .describe(
      "Original subject and sender from the fetched email, for reply context."
    ),
})
export type EmailDraft = EmailContent &
  z.infer<typeof emailContextSchema> & {
    revision: number
    editable: (keyof EmailContent)[]
  }
export const emailDraftActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("discard") }),
  z.object({
    action: z.enum(["save", "send"]),
    revision: z.number().int().nonnegative(),
    content: emailContentSchema,
  }),
])
export type EmailDraftAction = z.infer<typeof emailDraftActionSchema>

type Field = keyof EmailContent
const storedSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  input: z.record(z.string(), z.unknown()),
  schema: z.record(z.string(), z.unknown()),
  fields: z.object({
    to: z.string(),
    subject: z.string().optional(),
    body: z.string(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
  }),
  context: emailContextSchema,
})
type StoredEmail = z.infer<typeof storedSchema>
const KEY = "__kraftyEmailDraft"

function readStored(input: Record<string, unknown>) {
  return storedSchema.safeParse(input[KEY]).data
}
function text(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
    return value.join(", ")
  return ""
}
type Property = {
  type?: string | string[]
  items?: Property
  anyOf?: Property[]
  oneOf?: Property[]
}
function propertyType(
  value: Property | undefined
): "string" | "array" | undefined {
  if (!value) return undefined
  if (value.type === "string" || value.type?.includes("string")) return "string"
  if (
    (value.type === "array" || value.type?.includes("array")) &&
    propertyType(value.items) === "string"
  )
    return "array"
  for (const option of value.anyOf ?? value.oneOf ?? []) {
    const kind = propertyType(option)
    if (kind) return kind
  }
}
function content(stored: StoredEmail): EmailContent {
  return Object.fromEntries(
    (["to", "cc", "bcc", "subject", "body"] as const).map((field) => [
      field,
      field === "subject" && !stored.fields.subject
        ? (stored.context.subject ?? "")
        : text(stored.input[stored.fields[field] ?? ""]),
    ])
  ) as EmailContent
}
export function publicEmailDraft(
  input: Record<string, unknown>
): EmailDraft | undefined {
  const stored = readStored(input)
  if (!stored) return undefined
  return {
    ...stored.context,
    ...content(stored),
    revision: stored.revision,
    editable: Object.keys(stored.fields) as Field[],
  }
}

// Only plain-text send schemas we can faithfully display and edit. A raw
// MIME message, HTML, attachments or nested provider body must never be sent
// behind a card that hides part of what the owner is approving.
export function stageEmailDraft(
  tool: {
    slug: string
    toolkit: string
    inputSchema?: Record<string, unknown>
  },
  input: Record<string, unknown>,
  context: z.infer<typeof emailContextSchema> = {}
): Record<string, unknown> | undefined {
  if (
    !["gmail", "outlook"].includes(tool.toolkit) ||
    !/_(SEND_EMAIL|SEND_MAIL|REPLY_TO_THREAD)$/.test(tool.slug) ||
    !tool.inputSchema
  )
    return undefined
  if (
    input.is_html === true ||
    input.isHtml === true ||
    Object.entries(input).some(
      ([key, value]) =>
        /attachment|raw|mime|extra_recipients/i.test(key) &&
        value != null &&
        value !== "" &&
        (!Array.isArray(value) || value.length)
    )
  )
    return undefined
  const properties = tool.inputSchema.properties as
    Record<string, Property> | undefined
  if (!properties) return undefined
  const find = (names: string[], array = false) =>
    names.find((name) => {
      const kind = propertyType(properties[name])
      return kind === "string" || (array && kind === "array")
    })
  const to = find(["recipient_email", "to", "to_recipients"], true)
  const subject = find(["subject"])
  const body = find(["body", "message_body", "content"])
  if (!to || !body || (!subject && !context.subject)) return undefined
  const cc = find(["cc", "cc_recipients"], true)
  const bcc = find(["bcc", "bcc_recipients"], true)
  const visibleFields = new Set([to, subject, body, cc, bcc])
  if (
    Object.entries(input).some(
      ([key, value]) =>
        /^(to|recipient_email|to_recipients|cc|cc_recipients|bcc|bcc_recipients)$/.test(
          key
        ) &&
        !visibleFields.has(key) &&
        value != null &&
        value !== "" &&
        (!Array.isArray(value) || value.length)
    )
  )
    return undefined
  const stored: StoredEmail = {
    version: 1,
    revision: 0,
    input,
    schema: tool.inputSchema,
    fields: {
      to,
      ...(subject && { subject }),
      body,
      ...(cc && { cc }),
      ...(bcc && { bcc }),
    },
    context: emailContextSchema.parse(context),
  }
  emailContentSchema.parse(content(stored))
  return { [KEY]: stored }
}

export function editEmailDraft(
  input: Record<string, unknown>,
  revision: number,
  value: EmailContent
) {
  const stored = readStored(input)
  if (!stored) throw new Error("Email draft not found")
  if (revision !== stored.revision) throw new Error(EMAIL_CHANGED_ERROR)
  const next = emailContentSchema.parse(value)
  const previous = content(stored)
  const args = { ...stored.input }
  const properties = stored.schema.properties as Record<string, Property>
  for (const field of Object.keys(next) as Field[]) {
    const key = stored.fields[field]
    if (!key) {
      if (next[field] !== previous[field]) throw new Error(EMAIL_CHANGED_ERROR)
      continue
    }
    // Preserve omitted optional fields, which may reject an empty value.
    if (next[field] === previous[field]) continue
    const required = stored.schema.required as string[] | undefined
    if (!next[field] && !required?.includes(key)) {
      delete args[key]
      continue
    }
    args[key] =
      propertyType(properties[key]) === "array"
        ? next[field]
            .split(/[,;]/)
            .map((address) => address.trim())
            .filter(Boolean)
        : next[field]
  }
  z.fromJSONSchema(stored.schema).parse(args)
  return { [KEY]: { ...stored, input: args, revision: revision + 1 } }
}

// Metadata is never forwarded to a provider; only the saved, validated call.
export function emailExecutionArguments(input: Record<string, unknown>) {
  return readStored(input)?.input ?? input
}
