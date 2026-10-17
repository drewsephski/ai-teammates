import { isChatGPTSelected } from "@/lib/chatgpt-connection"
import { chatGPTModelForUser } from "@/lib/chatgpt-model"
import { ownModelForUser, selectedModelKey } from "@/lib/model-keys"
import type { ModelProvider } from "@/lib/model-key-policy"

// Who pays for a person's replies: Krafty's allowance, their ChatGPT plan, or
// an API key they brought. Only Krafty's model spends the allowance; web
// search and the computer guard always do.

// True when replies don't spend the Krafty allowance
export async function usesOwnModel(userId: string) {
  const [chatgpt, key] = await Promise.all([
    isChatGPTSelected(userId),
    selectedModelKey(userId),
  ])
  return chatgpt || !!key
}

export type ReplyModel =
  | { kind: "krafty" }
  | {
      kind: "chatgpt"
      model: Awaited<ReturnType<typeof chatGPTModelForUser>>
    }
  | {
      kind: "key"
      provider: ModelProvider
      model: NonNullable<Awaited<ReturnType<typeof ownModelForUser>>>["model"]
    }

// Resolved on the server from what the person saved, never from the browser
export async function replyModelForUser(userId: string): Promise<ReplyModel> {
  if (await isChatGPTSelected(userId))
    return { kind: "chatgpt", model: await chatGPTModelForUser(userId) }
  const own = await ownModelForUser(userId)
  return own ? { kind: "key", ...own } : { kind: "krafty" }
}
