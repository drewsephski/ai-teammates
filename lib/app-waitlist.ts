import { z } from "zod"

export const appWaitlistSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  platforms: z
    .array(z.enum(["mac", "iphone"]))
    .min(1)
    .max(2)
    .transform((values) => [...new Set(values)]),
  website: z.string().max(0).optional(),
})

export type WaitlistPlatform = "mac" | "iphone"
export type WaitlistResult = { ok: true } | { ok: false; error: string }
