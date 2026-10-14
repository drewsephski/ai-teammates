import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { connectorCatalog, type ConnectorApp } from "@/lib/composio"

export async function getWorkspaceApps() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) throw new Error("Unauthorized")
  if (!process.env.COMPOSIO_API_KEY)
    return { apps: [] as ConnectorApp[], unavailable: false }
  try {
    const apps: ConnectorApp[] = []
    let cursor: string | undefined
    do {
      const page = await connectorCatalog(userId, {
        connected: true,
        search: "",
        cursor,
      })
      apps.push(...page.apps.filter((app) => app.connected))
      cursor = page.cursor
    } while (cursor)
    return { apps, unavailable: false }
  } catch (error) {
    Sentry.captureException(error, { tags: { surface: "workspace-apps" } })
    return { apps: [] as ConnectorApp[], unavailable: true }
  }
}
