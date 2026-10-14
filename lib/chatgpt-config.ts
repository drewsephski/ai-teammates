import { chatGPTEncryptionKey } from "@/lib/chatgpt-crypto"

export const CHATGPT_ISSUER = "https://auth.openai.com"
export const CHATGPT_RESOURCE = "https://api.openai.com/v1"

// No dynamic-agent registration: hosted deployments require a provisioned client.
export function chatGPTConfig() {
  const clientId = process.env.CHATGPT_CLIENT_ID?.trim()
  const redirectUri = process.env.CHATGPT_REDIRECT_URI?.trim()
  const encryptionKey = process.env.CHATGPT_TOKEN_ENCRYPTION_KEY?.trim()
  if (!clientId || !redirectUri || !encryptionKey) return null
  if (!clientId.startsWith("oaiapp_")) return null
  try {
    const callback = new URL(redirectUri)
    if (
      (callback.protocol !== "https:" &&
        !(
          callback.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(callback.hostname)
        )) ||
      callback.pathname !== "/api/chatgpt/callback" ||
      callback.search ||
      callback.hash ||
      callback.username ||
      callback.password
    )
      return null
    return {
      clientId,
      redirectUri,
      origin: callback.origin,
      encryptionKey: chatGPTEncryptionKey(encryptionKey),
      clientSecret: process.env.CHATGPT_CLIENT_SECRET?.trim() || null,
      planUsageEnabled: process.env.CHATGPT_PLAN_USAGE_ENABLED === "true",
    }
  } catch {
    return null
  }
}

export function requireChatGPTConfig() {
  const config = chatGPTConfig()
  if (!config) throw new Error("ChatGPT connection is not available yet.")
  return config
}
