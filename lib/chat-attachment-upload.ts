import { HttpError } from "@/lib/api-response"
import {
  attachmentNameSchema,
  attachmentTypeSchema,
  MAX_ATTACHMENT_BYTES,
  validAttachmentBytes,
} from "@/lib/chat-attachment-policy"

export async function readChatAttachment(request: Request) {
  const type = attachmentTypeSchema.safeParse(
    request.headers.get("content-type")?.split(";")[0]
  )
  if (!type.success)
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Choose an image, PDF, or supported text file"
    )
  const mediaType = type.data
  let filename: string
  try {
    filename = decodeURIComponent(request.headers.get("x-file-name") ?? "")
  } catch {
    throw new HttpError(400, "invalid_request", "Choose a valid file name")
  }
  filename = attachmentNameSchema.parse(filename)
  const tooLarge = () =>
    new HttpError(413, "payload_too_large", "Files must be 10 MB or smaller")
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES)
    throw tooLarge()
  if (!request.body)
    throw new HttpError(400, "invalid_request", "The file is empty")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_ATTACHMENT_BYTES) {
        await reader.cancel()
        throw tooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  if (!validAttachmentBytes(bytes, mediaType))
    throw new HttpError(
      415,
      "unsupported_media_type",
      "The file contents do not match a supported file type"
    )
  return { filename, mediaType, bytes }
}
