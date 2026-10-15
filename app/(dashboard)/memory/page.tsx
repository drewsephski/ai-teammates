import { auth } from "@clerk/nextjs/server"
import { and, desc, eq, isNull } from "drizzle-orm"

import { AppPageHeader } from "@/components/app-page-header"
import { AboutYouForm } from "@/components/memory/about-you-form"
import { MemoryList } from "@/components/memory/memory-list"
import { MemorySettingsForm } from "@/components/memory/memory-settings-form"
import { db } from "@/db"
import { bots, memories, type AboutYou } from "@/db/schema"
import { getUserSettings } from "@/lib/memory"
import { readAboutYou } from "@/lib/memory-policy"

export default async function Page() {
  const { userId } = await auth.protect()

  const [settings, rows, teammates] = await Promise.all([
    getUserSettings(userId),
    db
      .select({
        id: memories.id,
        kind: memories.kind,
        content: memories.content,
        botId: memories.botId,
        pinned: memories.pinned,
        source: memories.source,
        sourceChatId: memories.sourceChatId,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.status, "active"),
          isNull(memories.invalidAt)
        )
      )
      .orderBy(desc(memories.pinned), desc(memories.createdAt)),
    db
      .select({ id: bots.id, name: bots.name })
      .from(bots)
      .where(eq(bots.userId, userId))
      .orderBy(bots.createdAt),
  ])

  // The About you fields live in the same store; show them in their own form
  const about: AboutYou = {
    timezone: settings.timezone === "UTC" ? "" : settings.timezone,
    role: "",
    workingHours: "",
    answerStyle: "",
    about: "",
  }
  const listed = rows.filter((row) => {
    const field =
      row.source === "user_edit" && row.botId === null
        ? readAboutYou(row.content)
        : undefined
    if (!field) return true
    if (field.key !== "timezone") about[field.key] = field.value
    return false
  })

  return (
    <section>
      <AppPageHeader title="Memory" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Memory
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            What your teammates remember about you. Memories are shared by every
            teammate unless they&apos;re scoped to one. Edit or delete anything
            here.
          </p>
        </div>
        <MemorySettingsForm memoryEnabled={settings.memoryEnabled} />
        <AboutYouForm
          values={about}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
        <MemoryList memories={listed} teammates={teammates} />
      </div>
    </section>
  )
}
