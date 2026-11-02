import { Suspense } from "react"
import { auth } from "@clerk/nextjs/server"

import { AppPageHeader } from "@/components/app-page-header"
import { CreateBotButton } from "@/components/create-bot-button"
import { botPresets } from "@/lib/bot-presets"
import { findBotTemplate } from "@/lib/bot-templates"
import { BotTemplateDialog } from "@/components/bot-template-dialog"
import { WorkspaceBots } from "@/components/workspace-bots"
import { WorkspacePresets } from "@/components/workspace-presets"
import { Skeleton } from "@/components/ui/skeleton"
import { getWorkspaceBots } from "@/queries/workspace"
import { getWorkspaceApps } from "@/queries/workspace-apps"
import { WorkspaceApps } from "@/components/workspace-apps"
import { WorkspaceSecrets } from "@/components/workspace-secrets"
import { getWorkspaceSecrets } from "@/queries/secrets"
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
  const { role, create } = params
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
  // A public page's "Create this Bot" link (createBotHref) lands here
  const template =
    typeof create === "string" ? findBotTemplate(create) : undefined
  // Start independent reads together, but stream each section when ready.
  // Connected-app providers and live activity never block the page controls.
  const bots = getWorkspaceBots({ activity: false })
  const connections = getWorkspaceApps()
  const forYou = getWorkspaceForYou()
  const notices = getSignedInNotices()
  const secrets = getWorkspaceSecrets()

  return (
    <section className="flex min-h-svh flex-col">
      <AppPageHeader title="Workspace">
        <CreateBotButton variant="outline" size="sm">
          Create bot
        </CreateBotButton>
      </AppPageHeader>
      {template && <BotTemplateDialog key={template.id} template={template} />}
      <div className="mx-auto w-full max-w-4xl space-y-10 px-4 py-8 sm:px-6 sm:py-10">
        <Suspense fallback={null}>
          <NoticesSection notices={notices} />
        </Suspense>
        <Suspense fallback={<SectionLoading label="Loading teammates" />}>
          <BotsSection bots={bots} />
        </Suspense>
        <div className="flex justify-center">
          <CreateBotButton size="lg">Create bot</CreateBotButton>
        </div>
        <Suspense
          fallback={<SectionLoading label="Loading suggestions and apps" />}
        >
          <ConnectedSections
            bots={bots}
            connections={connections}
            forYou={forYou}
            connectionCallback={connectionCallback}
          />
        </Suspense>
        <Suspense fallback={null}>
          <SecretsSection secrets={secrets} />
        </Suspense>
        <WorkspacePresets presetId={preset?.id} />
      </div>
    </section>
  )
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  )
}

async function BotsSection({
  bots,
}: {
  bots: ReturnType<typeof getWorkspaceBots>
}) {
  return <WorkspaceBots bots={await bots} live />
}

async function NoticesSection({
  notices,
}: {
  notices: ReturnType<typeof getSignedInNotices>
}) {
  return <WorkspaceNotices notices={await notices} />
}

async function SecretsSection({
  secrets,
}: {
  secrets: ReturnType<typeof getWorkspaceSecrets>
}) {
  return <WorkspaceSecrets secrets={await secrets} />
}

async function ConnectedSections({
  bots,
  connections,
  forYou,
  connectionCallback,
}: {
  bots: ReturnType<typeof getWorkspaceBots>
  connections: ReturnType<typeof getWorkspaceApps>
  forYou: ReturnType<typeof getWorkspaceForYou>
  connectionCallback: React.ComponentProps<
    typeof WorkspaceApps
  >["connectionCallback"]
}) {
  const [botList, apps, suggestions] = await Promise.all([
    bots,
    connections,
    forYou,
  ])
  return (
    <>
      <WorkspaceForYou
        live
        initial={suggestions}
        apps={apps.apps.map(({ slug, name }) => ({ slug, name }))}
        hasBots={botList.some((bot) => bot.activity !== "setup")}
        appsUnavailable={apps.unavailable}
      />
      <WorkspaceApps {...apps} connectionCallback={connectionCallback} />
    </>
  )
}
