import { z } from "zod"

export const sidebarOrderSchema = z
  .array(z.string().min(1).max(128))
  .min(1)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs")

export function applySidebarOrder<T extends { id: string }>(
  items: T[],
  ids: string[]
) {
  const ranks = new Map(ids.map((id, index) => [id, index]))
  return [...items].sort(
    (a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)
  )
}
