import { auth } from "@clerk/nextjs/server"

import { AppPageHeader } from "@/components/app-page-header"
import { AboutYouForm } from "@/components/memory/about-you-form"
import { MemoryList } from "@/components/memory/memory-list"
import { MemorySettingsForm } from "@/components/memory/memory-settings-form"
import { getMemoryOverview } from "@/services/memory"

export default async function Page() {
  const { userId } = await auth.protect()

  const { memoryEnabled, about, memories, teammates } =
    await getMemoryOverview(userId)

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
        <MemorySettingsForm memoryEnabled={memoryEnabled} />
        <AboutYouForm
          values={about}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
        <MemoryList memories={memories} teammates={teammates} />
      </div>
    </section>
  )
}
