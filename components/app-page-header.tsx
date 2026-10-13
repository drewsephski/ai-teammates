import { SidebarTrigger } from "@/components/ui/sidebar"

export function AppPageHeader({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4 sm:px-6">
      <SidebarTrigger className="text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      {children && (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      )}
    </header>
  )
}
