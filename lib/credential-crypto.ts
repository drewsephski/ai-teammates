import {
  chatGPTEncryptionKey,
  decryptChatGPTValue,
  encryptChatGPTValue,
} from "@/lib/chatgpt-crypto"

// Secrets people hand Krafty (model API keys, Slack bot tokens) are sealed
// with AES-256-GCM under CREDENTIAL_ENCRYPTION_KEY. The context binds each
// value to its owner and purpose, so a sealed value copied to another row
// doesn't open.

export function credentialStorageReady() {
  return /^[a-f\d]{64}$/i.test(
    process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ?? ""
  )
}

function key() {
  const value = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim()
  if (!value) throw new Error("Credential storage is not configured")
  return chatGPTEncryptionKey(value)
}

export function sealCredential(value: string, context: string) {
  return encryptChatGPTValue(value, context, key())
}

export function openCredential(value: string, context: string) {
  return decryptChatGPTValue(value, context, key())
}
