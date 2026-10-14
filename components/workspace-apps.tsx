import { ConnectorMarketplace } from "@/components/connector-marketplace"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { ConnectorApp } from "@/lib/composio"
import type { ConnectorCallback } from "@/lib/connector-callback"

export function WorkspaceApps({
  apps,
  unavailable,
  connectionCallback,
}: {
  apps: ConnectorApp[]
  unavailable: boolean
  connectionCallback?: ConnectorCallback
}) {
  return (
    <section aria-labelledby="workspace-apps-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="workspace-apps-title" className="text-sm font-medium">
          Connected apps
        </h2>
        <ConnectorMarketplace
          trigger={<Button variant="ghost" size="sm" />}
          connectionCallback={connectionCallback}
        >
          {apps.length ? "Manage apps" : "Connect apps"}
        </ConnectorMarketplace>
      </div>
      {apps.length ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-3">
          {apps.map((app) => (
            <li
              key={app.slug}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Avatar className="size-5 rounded-sm">
                <AvatarImage src={app.logo} alt="" />
                <AvatarFallback className="rounded-sm text-xs">
                  {app.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {app.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {unavailable
            ? "Apps are temporarily unavailable. Try opening Apps again."
            : "Connect the tools your bots can work with."}
        </p>
      )}
    </section>
  )
}
