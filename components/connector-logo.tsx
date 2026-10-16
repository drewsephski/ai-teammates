import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { ConnectorApp } from "@/lib/composio"
import { cn } from "cn"

export function ConnectorLogo({
  app,
  className,
}: {
  app: Pick<ConnectorApp, "slug" | "name" | "logo">
  className?: string
}) {
  return (
    <Avatar
      className={cn(
        "size-9 rounded-sm after:hidden",
        app.slug === "github" && "bg-background p-0.5 dark:bg-primary",
        className
      )}
    >
      <AvatarImage
        src={app.logo}
        alt=""
        className="rounded-none object-contain"
      />
      <AvatarFallback className="rounded-sm text-xs">
        {app.name.slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  )
}
