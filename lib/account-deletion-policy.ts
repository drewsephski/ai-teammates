import { z } from "zod"

export const accountDeletionSchema = z.object({
  confirm: z.string().refine((value) => value === "delete my account", {
    message: 'Type "delete my account" to confirm.',
  }),
})

export type AccountDeletionInput = z.infer<typeof accountDeletionSchema>
export type AccountDeletionResult =
  | { ok: true; appleSignIn?: "revoked" | "manual" | "none" }
  | { ok: false; message: string }

// Older cleanup returns void. Preserve the additive Apple outcome without
// depending on imports from the separate revocation workstream.
export function appleDeletionOutcome(result: unknown) {
  if (!result || typeof result !== "object" || !("appleSignIn" in result))
    return undefined
  const outcome = result.appleSignIn
  return outcome === "revoked" || outcome === "manual" || outcome === "none"
    ? outcome
    : undefined
}
