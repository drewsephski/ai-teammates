import { auth } from "@clerk/nextjs/server"

import { AppPageHeader } from "@/components/app-page-header"
import { CreateBotButton } from "@/components/create-bot-button"
import { botPresets } from "@/lib/bot-presets"
import { WorkspaceBots } from "@/components/workspace-bots"
import { WorkspacePresets } from "@/components/workspace-presets"
import { WorkspaceRefresh } from "@/components/workspace-refresh"
import { getWorkspaceBots } from "@/queries/workspace"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  await auth.protect()

  const { role } = await searchParams
  const preset = botPresets.find((preset) => preset.id === role)
  const bots = await getWorkspaceBots()

  return (
    <section className="flex min-h-svh flex-col">
      <AppPageHeader title="Workspace">
        <CreateBotButton variant="outline" size="sm">
          Create bot
        </CreateBotButton>
      </AppPageHeader>
      <WorkspaceRefresh />
      <div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">
        <WorkspaceBots bots={bots} />
        <WorkspacePresets presetId={preset?.id} />
      </div>
    </section>
  )
}
