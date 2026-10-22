import { and, desc, eq, isNull, sql } from "drizzle-orm"

import { db } from "@/db"
import { notices } from "@/db/schema"

// Notices the person hasn't dismissed yet, newest first
export async function listNotices(userId: string) {
  return db
    .select({
      id: notices.id,
      title: notices.title,
      body: notices.body,
      createdAt: notices.createdAt,
    })
    .from(notices)
    .where(and(eq(notices.userId, userId), isNull(notices.dismissedAt)))
    .orderBy(desc(notices.createdAt))
    .limit(5)
}

// Dismissing twice is fine: a phone may retry after a dropped response
export async function dismissNotice(userId: string, noticeId: string) {
  const [row] = await db
    .update(notices)
    .set({ dismissedAt: sql`coalesce(${notices.dismissedAt}, now())` })
    .where(and(eq(notices.id, noticeId), eq(notices.userId, userId)))
    .returning({ id: notices.id })
  if (!row) throw new Error("Notice not found")
  return row
}
