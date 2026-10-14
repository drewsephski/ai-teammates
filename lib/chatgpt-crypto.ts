import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

export function hashChatGPTValue(value: string) {
  return createHash("sha256").update(value).digest("base64url")
}

export function randomChatGPTValue() {
  return randomBytes(32).toString("base64url")
}

export function chatGPTEncryptionKey(value: string) {
  if (!/^[a-f\d]{64}$/i.test(value))
    throw new Error("Invalid ChatGPT encryption configuration")
  return Buffer.from(value, "hex")
}

export function encryptChatGPTValue(
  value: string,
  context: string,
  key: Buffer
) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".")
}

export function decryptChatGPTValue(
  value: string,
  context: string,
  key: Buffer
) {
  const [version, iv, tag, encrypted, extra] = value.split(".")
  if (version !== "v1" || !iv || !tag || !encrypted || extra)
    throw new Error("Invalid ChatGPT credential")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64url")
  )
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
