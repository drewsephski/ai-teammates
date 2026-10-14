import { auth } from "@clerk/nextjs/server"

import { AppPageHeader } from "@/components/app-page-header"
import { CreateBotButton } from "@/components/create-bot-button"
import { botPresets } from "@/lib/bot-presets"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  await auth.protect()

  const { role } = await searchParams
  const preset = botPresets.find((preset) => preset.id === role)

  return (
    <section className="flex min-h-svh flex-col">
      <AppPageHeader title="Workspace" />
      <div className="flex flex-1 items-center justify-center p-6">
        <CreateBotButton key={preset?.id ?? "custom"} presetId={preset?.id}>
          Create bot
        </CreateBotButton>
      </div>
    </section>
  )
}
