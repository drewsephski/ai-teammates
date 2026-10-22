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
import { getWorkspaceForYou } from "@/queries/for-you"
import { WorkspaceNotices } from "@/components/workspace-notices"
import { getSignedInNotices } from "@/queries/notices"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await auth.protect()

  const params = await searchParams
  const { role } = params
  const connectionCallback =
    params.apps === "connect"
      ? {
          state:
            typeof params.connection_state === "string"
              ? params.connection_state
              : "",
          status:
            params.status === "success"
              ? ("success" as const)
              : ("failed" as const),
          accountId:
            typeof params.connected_account_id === "string"
              ? params.connected_account_id
              : "",
        }
      : undefined
  const preset = botPresets.find((preset) => preset.id === role)
  const [bots, connections, forYou, notices] = await Promise.all([
    getWorkspaceBots(),
    getWorkspaceApps(),
    getWorkspaceForYou(),
    getSignedInNotices(),
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
        <WorkspaceNotices notices={notices} />
        <WorkspaceBots bots={bots} />
        <div className="flex justify-center">
          <CreateBotButton size="lg">Create bot</CreateBotButton>
        </div>
        <WorkspaceForYou
          initial={forYou}
          apps={connections.apps.map(({ slug, name }) => ({ slug, name }))}
          hasBots={bots.some((bot) => bot.activity !== "setup")}
          appsUnavailable={connections.unavailable}
        />
        <WorkspaceApps
          {...connections}
          connectionCallback={connectionCallback}
        />
        <WorkspacePresets presetId={preset?.id} />
      </div>
    </section>
  )
}
