import { z } from "zod"

export const pinnedBotOrderSchema = z
  .array(z.string().min(1).max(128))
  .min(1)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate bot IDs")

// Keep the existing pin timestamps as ordering slots. Only their owners change.
export function pinnedBotOrderUpdates(
  ids: string[],
  rows: { id: string; pinnedAt: Date | null }[]
) {
  const owned = new Set(rows.map((row) => row.id))
  if (
    rows.length !== ids.length ||
    ids.some((id) => !owned.has(id)) ||
    rows.some((row) => !row.pinnedAt)
  )
    throw new Error("Pinned bots changed. Try again.")

  const slots = rows.map((row) => row.pinnedAt!.getTime()).sort((a, b) => a - b)
  return ids.map((id, index) => {
    // Pins made in the same millisecond still need a deterministic order.
    if (index > 0) slots[index] = Math.max(slots[index], slots[index - 1] + 1)
    return { id, pinnedAt: new Date(slots[index]) }
  })
}
