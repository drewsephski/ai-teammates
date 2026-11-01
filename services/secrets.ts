import { secretSaveSchema } from "@/db/schema"
import { wakeAfterSecret } from "@/lib/secret-wake"
import {
  listUserSecretNames,
  removeUserSecret,
  storeUserSecret,
  type PublicSecret,
} from "@/lib/user-secrets"

export type SaveSecretDeps = {
  wake?: typeof wakeAfterSecret
}

// Saves a key from the key card in a chat or from /workspace. From a card
// (chatId and questionId), the bot that asked is woken; the wake checks the
// chat and bot belong to this person and skips them otherwise. The key itself
// is saved either way: it is the person's own.
export async function saveSecret(
  userId: string,
  input: unknown,
  deps: SaveSecretDeps = {}
): Promise<{ secret: PublicSecret; woke?: boolean; inputSeq?: number }> {
  const { chatId, botId, questionId, ...values } = secretSaveSchema.parse(input)
  const secret = await storeUserSecret(userId, values)
  if (!chatId || !questionId) return { secret }
  const { woke, inputSeq } = await (deps.wake ?? wakeAfterSecret)(userId, {
    chatId,
    botId,
    questionId,
    name: secret.name,
    label: secret.label,
  })
  return { secret, woke, ...(inputSeq !== undefined && { inputSeq }) }
}

export async function listSecrets(userId: string) {
  return listUserSecretNames(userId)
}

export async function deleteSecret(userId: string, name: string) {
  if (!(await removeUserSecret(userId, name))) throw new Error("Key not found")
}
