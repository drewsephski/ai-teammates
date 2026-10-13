import { cookies } from "next/headers"
import { auth } from "@clerk/nextjs/server"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The sidebar loads the user's chats, so signed-out visitors go to sign-in first
  await auth.protect()

  // SidebarProvider writes this cookie on every toggle
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <ScrollArea className="h-full">{children}</ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  )
}
