"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, Grid2X2Icon, RefreshCwIcon, SearchIcon } from "lucide-react"
import {
  connectApp,
  completeAppConnection,
  disconnectApp,
  listConnectorApps,
} from "@/actions/connectors"
import type { ConnectorApp } from "@/lib/composio"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ConnectorLogo } from "@/components/connector-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { FREE_APP_LIMIT_ERROR } from "@/lib/billing-policy"
import type { ConnectorCallback } from "@/lib/connector-callback"

export function ConnectorMarketplace({
  trigger,
  children,
  initialSearch = "",
  initialTab = "all",
  connectionCallback,
}: {
  trigger?: React.ReactElement
  children?: React.ReactNode
  initialSearch?: string
  initialTab?: "all" | "connected"
  connectionCallback?: ConnectorCallback
} = {}) {
  const router = useRouter()
  const [open, setOpen] = useState(!!connectionCallback)
  const [revision, setRevision] = useState(0)
  const handledCallback = useRef(false)

  useEffect(() => {
    if (!connectionCallback || handledCallback.current) return
    handledCallback.current = true
    // Remove provider parameters so refresh/back navigation won't repeat a toast.
    const url = new URL(window.location.href)
    for (const key of [
      "apps",
      "connection_state",
      "status",
      "connected_account_id",
    ])
      url.searchParams.delete(key)
    window.history.replaceState(null, "", url.href)
    void (async () => {
      try {
        const connected = await completeAppConnection(connectionCallback)
        toast.add({
          type: connected ? "success" : "error",
          title: connected
            ? "Successfully connected"
            : "Connection not completed",
          ...(!connected && {
            description: "Please try connecting the app again.",
          }),
        })
        setRevision((value) => value + 1)
        router.refresh()
      } catch (error) {
        toast.add({
          type: "error",
          title: "Couldn't verify the connection",
          description:
            error instanceof Error ? error.message : "Please refresh Apps.",
        })
      }
    })()
  }, [connectionCallback, router])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <SidebarMenuButton tooltip="Apps" className="h-10 rounded-xl" />
          )
        }
      >
        {children ?? (
          <>
            <Grid2X2Icon />
            <span>Apps</span>
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apps</DialogTitle>
          <DialogDescription>
            Connect the tools your teammates need to get work done.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <MarketplaceContent
            initialSearch={initialSearch}
            initialTab={initialTab}
            refreshKey={revision}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MarketplaceContent({
  initialSearch,
  initialTab,
  refreshKey,
}: {
  initialSearch: string
  initialTab: "all" | "connected"
  refreshKey: number
}) {
  const router = useRouter()
  const generation = useRef(0)
  const [search, setSearch] = useState(initialSearch)
  const [tab, setTab] = useState<"all" | "connected">(initialTab)
  const [revision, setRevision] = useState(0)
  const [apps, setApps] = useState<ConnectorApp[]>([])
  const [cursor, setCursor] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [authorization, setAuthorization] = useState<{
    slug: string
    url: string
    accountId: string
  }>()

  useEffect(() => {
    let current = true
    generation.current += 1
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(undefined)
      try {
        const result = await listConnectorApps({
          search,
          connected: tab === "connected",
        })
        if (!current) return
        setApps(result.apps)
        setCursor(result.cursor)
        setConfigured(result.configured)
      } catch (error) {
        if (current)
          setError(
            error instanceof Error ? error.message : "Couldn't load apps."
          )
      } finally {
        if (current) setLoading(false)
      }
    }, 200)
    return () => {
      current = false
      generation.current += 1
      clearTimeout(timer)
    }
  }, [search, tab, revision, refreshKey])

  useEffect(() => {
    if (!authorization) return
    function refresh() {
      setRevision((value) => value + 1)
      router.refresh()
    }
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [authorization, router])

  async function connect(app: ConnectorApp) {
    // Reserve the tab during the click; browsers block tabs opened after await.
    const popup = window.open("about:blank", "_blank")
    if (popup) popup.opener = null
    setBusy(app.slug)
    try {
      const result = await connectApp(app.slug)
      if (!result.ok) {
        popup?.close()
        toast.add({
          type: "error",
          title: "Connected app limit reached",
          description: FREE_APP_LIMIT_ERROR,
          actionProps: {
            children: "See plans",
            onClick: () => router.push("/pricing"),
          },
        })
        return
      }
      setAuthorization({
        slug: app.slug,
        url: result.url,
        accountId: result.accountId,
      })
      if (popup) popup.location.replace(result.url)
    } catch (error) {
      popup?.close()
      toast.add({
        type: "error",
        title: "Connection failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function disconnect(app: ConnectorApp) {
    if (!app.accountId) return
    setBusy(app.slug)
    try {
      await disconnectApp(app.accountId)
      setAuthorization(undefined)
      setRevision((value) => value + 1)
      toast.add({ type: "success", title: `${app.name} disconnected` })
      router.refresh()
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't disconnect",
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function loadMore() {
    if (!cursor || loading) return
    const request = generation.current
    setLoading(true)
    try {
      const result = await listConnectorApps({
        search,
        connected: tab === "connected",
        cursor,
      })
      if (request !== generation.current) return
      setApps((apps) => [
        ...apps,
        ...result.apps.filter(
          (app) => !apps.some((item) => item.slug === app.slug)
        ),
      ])
      setCursor(result.cursor)
    } catch (error) {
      if (request === generation.current)
        setError(
          error instanceof Error ? error.message : "Couldn't load more apps."
        )
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search apps"
          placeholder="Search apps…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </InputGroup>
      <div className="flex items-center justify-between gap-2">
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value === "connected" ? "connected" : "all")
          }
        >
          <TabsList>
            <TabsTrigger value="all">All apps</TabsTrigger>
            <TabsTrigger value="connected">Connected</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh connections"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCwIcon />
        </Button>
      </div>
      {authorization &&
        !apps.some(
          (app) =>
            app.slug === authorization.slug &&
            app.accountId === authorization.accountId &&
            app.connected
        ) && (
          <Alert>
            <AlertDescription>
              Finish connecting in the authorization tab, then refresh.
              <Button
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() =>
                  disconnect({
                    slug: authorization.slug,
                    name: authorization.slug,
                    accountId: authorization.accountId,
                    connected: false,
                    noAuth: false,
                  })
                }
              >
                Cancel connection
              </Button>
              <Button
                className="ml-2"
                size="sm"
                variant="link"
                nativeButton={false}
                render={
                  <a
                    href={authorization.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                Continue connection
              </Button>
            </AlertDescription>
          </Alert>
        )}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="link"
              size="sm"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !configured ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>App connections are coming soon</EmptyTitle>
            <EmptyDescription>
              Your workspace administrator needs to finish setting up
              connections.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : loading && !apps.length ? (
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          aria-label="Loading apps"
          role="status"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !apps.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {tab === "connected" ? "No connected apps yet" : "No apps found"}
            </EmptyTitle>
            <EmptyDescription>
              {tab === "connected"
                ? "Browse all apps to connect your first tool."
                : "Try searching for a different app."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          aria-label="Connector apps"
          aria-busy={loading}
        >
          {apps.map((app) => (
            <Item
              key={app.slug}
              variant="outline"
              className="min-w-0 rounded-2xl bg-muted/30"
              role="listitem"
            >
              <ItemMedia>
                <ConnectorLogo app={app} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{app.name}</ItemTitle>
                <ItemDescription>
                  {app.connected ? (
                    <Badge variant="secondary">
                      <CheckIcon data-icon="inline-start" />
                      Connected
                    </Badge>
                  ) : app.noAuth ? (
                    "No account required"
                  ) : app.status && app.status !== "ACTIVE" ? (
                    "Reconnect your account"
                  ) : (
                    "Available to connect"
                  )}
                </ItemDescription>
              </ItemContent>
              <ItemActions
                className={
                  app.connected && !app.noAuth
                    ? "basis-full flex-wrap justify-end"
                    : undefined
                }
              >
                {app.connected && !app.noAuth && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={
                      !!busy || loading || authorization?.slug === app.slug
                    }
                    aria-label={`Reauthenticate ${app.name}`}
                    onClick={() => connect(app)}
                  >
                    Reauthenticate
                  </Button>
                )}
                {!app.noAuth && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy || loading}
                    aria-label={`${app.connected ? "Disconnect" : app.accountId && ["INITIATED", "INITIALIZING"].includes(app.status ?? "") ? "Cancel connection to" : "Connect"} ${app.name}`}
                    onClick={() =>
                      app.connected ||
                      (app.accountId &&
                        ["INITIATED", "INITIALIZING"].includes(
                          app.status ?? ""
                        ))
                        ? disconnect(app)
                        : connect(app)
                    }
                  >
                    {busy === app.slug && <Spinner data-icon="inline-start" />}
                    {app.connected
                      ? "Disconnect"
                      : app.accountId &&
                          ["INITIATED", "INITIALIZING"].includes(
                            app.status ?? ""
                          )
                        ? "Cancel connection"
                        : "Connect"}
                  </Button>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
      {cursor && !error && (
        <Button variant="outline" disabled={loading} onClick={loadMore}>
          {loading && <Spinner data-icon="inline-start" />}Load more apps
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Connections are private to your account and available to all your bots.
      </p>
    </div>
  )
}
