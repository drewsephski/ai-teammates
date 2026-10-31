import { hkdfSync } from "node:crypto"
// Trigger.dev runs this too (the bash tool's environment), so no Next imports
import * as Sentry from "@sentry/node"
import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  userSecretInputSchema,
  userSecrets,
  type UserSecretInput,
} from "@/db/schema"
import {
  chatGPTEncryptionKey,
  decryptChatGPTValue,
  encryptChatGPTValue,
} from "@/lib/chatgpt-crypto"

// What leaves the server about a saved key: never its value
export type PublicSecret = {
  name: string
  label: string
  createdAt: Date
  updatedAt: Date
}

const SAVE_ERROR = "Couldn't save the key"
const KEY_INFO = "krafty:user-secrets:v1"

let derived: { source: string; key: Buffer } | undefined

// A key of its own, derived from the ChatGPT token key, so the two kinds of
// ciphertext can never be swapped for each other
function userSecretKey() {
  try {
    const source = process.env.CHATGPT_TOKEN_ENCRYPTION_KEY?.trim() ?? ""
    if (derived?.source !== source) {
      const material = chatGPTEncryptionKey(source)
      derived = {
        source,
        key: Buffer.from(
          hkdfSync("sha256", material, Buffer.alloc(0), KEY_INFO, 32)
        ),
      }
    }
    return derived.key
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "user-secrets" } })
    throw new Error(SAVE_ERROR)
  }
}

// Binds a ciphertext to its owner and name: moved to another row, it fails
const secretContext = (userId: string, name: string) =>
  `krafty:user-secret:v1:${userId}:${name}`

// AES-256-GCM in the v1.iv.tag.data format of lib/chatgpt-crypto.ts
export function encryptUserSecret(
  value: string,
  userId: string,
  name: string,
  key: Buffer = userSecretKey()
) {
  return encryptChatGPTValue(value, secretContext(userId, name), key)
}

export function decryptUserSecret(
  ciphertext: string,
  userId: string,
  name: string,
  key: Buffer = userSecretKey()
) {
  return decryptChatGPTValue(ciphertext, secretContext(userId, name), key)
}

const publicColumns = {
  name: userSecrets.name,
  label: userSecrets.label,
  createdAt: userSecrets.createdAt,
  updatedAt: userSecrets.updatedAt,
}

// Saves or replaces the key with this name. Replacing keeps createdAt.
export async function storeUserSecret(
  userId: string,
  input: UserSecretInput
): Promise<PublicSecret> {
  const { name, label, value } = userSecretInputSchema.parse(input)
  const ciphertext = encryptUserSecret(value, userId, name)
  const [saved] = await db
    .insert(userSecrets)
    .values({ userId, name, label, ciphertext })
    .onConflictDoUpdate({
      target: [userSecrets.userId, userSecrets.name],
      set: { label, ciphertext, updatedAt: sql`now()` },
    })
    .returning(publicColumns)
  return saved
}

export async function listUserSecretNames(
  userId: string
): Promise<PublicSecret[]> {
  return db
    .select(publicColumns)
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .orderBy(asc(userSecrets.name))
}

const owned = (userId: string, name: string) =>
  and(eq(userSecrets.userId, userId), eq(userSecrets.name, name))

export async function removeUserSecret(userId: string, name: string) {
  const removed = await db
    .delete(userSecrets)
    .where(owned(userId, name))
    .returning({ id: userSecrets.id })
  return removed.length > 0
}

export async function hasUserSecret(userId: string, name: string) {
  const [row] = await db
    .select({ id: userSecrets.id })
    .from(userSecrets)
    .where(owned(userId, name))
    .limit(1)
  return Boolean(row)
}

// Every saved key as NAME -> value, for the computer's bash environment. A row
// that fails to decrypt is skipped and reported, so one bad row doesn't stop
// every command.
export async function loadUserSecretEnv(
  userId: string
): Promise<Record<string, string>> {
  const rows = await db
    .select({ name: userSecrets.name, ciphertext: userSecrets.ciphertext })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
  if (rows.length === 0) return {}
  let key: Buffer
  try {
    key = userSecretKey()
  } catch {
    // Already reported
    return {}
  }
  const env: Record<string, string> = {}
  for (const row of rows) {
    try {
      env[row.name] = decryptUserSecret(row.ciphertext, userId, row.name, key)
    } catch (error) {
      Sentry.captureException(error, {
        tags: { area: "user-secrets", step: "decrypt" },
        extra: { name: row.name },
        user: { id: userId },
      })
    }
  }
  return env
}
