import { auth } from "@clerk/nextjs/server"

import { AppPageHeader } from "@/components/app-page-header"
import { CreateBotButton } from "@/components/create-bot-button"
import { botPresets } from "@/lib/bot-presets"
import { WorkspaceBots } from "@/components/workspace-bots"
import { WorkspacePresets } from "@/components/workspace-presets"
import { WorkspaceRefresh } from "@/components/workspace-refresh"
import { getWorkspaceBots } from "@/queries/workspace"
import { getWorkspaceApps } from "@/queries/workspace-apps"
import { WorkspaceApps } from "@/components/workspace-apps"
import { WorkspaceForYou } from "@/components/workspace-for-you"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  await auth.protect()

  const { role } = await searchParams
  const preset = botPresets.find((preset) => preset.id === role)
  const [bots, connections] = await Promise.all([
    getWorkspaceBots(),
    getWorkspaceApps(),
  ])

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
        <div className="flex justify-center">
          <CreateBotButton size="lg">Create bot</CreateBotButton>
        </div>
        <WorkspaceForYou
          apps={connections.apps.map(({ slug, name, accountId }) => ({
            slug,
            name,
            accountId,
          }))}
          botIds={bots
            .filter((bot) => bot.activity !== "setup")
            .map((bot) => bot.id)}
          appsUnavailable={connections.unavailable}
        />
        <WorkspaceApps {...connections} />
        <WorkspacePresets presetId={preset?.id} />
      </div>
    </section>
  )
}
