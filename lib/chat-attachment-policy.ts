import { z } from "zod"

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_MESSAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS = 5
export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024
export const attachmentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const
export const attachmentTypeSchema = z.enum(attachmentTypes)
export const attachmentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (value) => value !== "." && value !== ".." && !/[\x00-\x1f/\\]/.test(value),
    "Choose a valid file name"
  )
export const attachmentUrl = (id: string) =>
  `https://kraftybot.app/chat-attachments/${encodeURIComponent(id)}`
export function attachmentId(value: string) {
  const match =
    /^https:\/\/kraftybot\.app\/chat-attachments\/([A-Za-z0-9_-]+)$/.exec(value)
  return match?.[1]
}

// Check bytes as well as the MIME supplied by the device. Never accept SVG/HTML.
export function validAttachmentBytes(bytes: Uint8Array, type: string) {
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) return false
  const head = Buffer.from(bytes.subarray(0, 12))
  if (type === "application/pdf")
    return head.toString("ascii").startsWith("%PDF-")
  if (type === "image/png")
    return head
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (type === "image/jpeg")
    return head[0] === 255 && head[1] === 216 && head[2] === 255
  if (type === "image/webp")
    return (
      head.toString("ascii", 0, 4) === "RIFF" &&
      head.toString("ascii", 8, 12) === "WEBP"
    )
  if (type === "image/gif") return /^GIF8[79]a/.test(head.toString("ascii"))
  if (!attachmentTypes.includes(type as (typeof attachmentTypes)[number]))
    return false
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return !bytes.includes(0)
  } catch {
    return false
  }
}
