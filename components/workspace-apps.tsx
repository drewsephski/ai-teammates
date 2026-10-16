import { ConnectorMarketplace } from "@/components/connector-marketplace"
import { ConnectorLogo } from "@/components/connector-logo"
import { Button } from "@/components/ui/button"
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
          initialTab={apps.length ? "connected" : "all"}
          connectionCallback={connectionCallback}
        >
          {apps.length ? "Manage apps" : "Connect apps"}
        </ConnectorMarketplace>
      </div>
      {apps.length ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-3">
          {apps.map((app) => (
            <li key={app.slug}>
              <ConnectorMarketplace
                initialSearch={app.name}
                initialTab="connected"
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto justify-start gap-2 rounded-sm p-0 font-normal text-muted-foreground"
                    aria-label={`Manage ${app.name} connection`}
                  />
                }
              >
                <ConnectorLogo app={app} className="size-5" />
                {app.name}
              </ConnectorMarketplace>
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
