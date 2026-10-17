"use client"

import { UserButton } from "@clerk/nextjs"
import { GaugeIcon, MoonIcon, SunIcon, Trash2Icon } from "lucide-react"
import { useTheme } from "next-themes"

// The account button in the sidebar footer, with the usage page in its menu.
// A client component, as the menu's parts only exist on the client.
function UserMenu() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    // Clerk's own styles beat plain utilities, so the SidebarMenuButton classes are mirrored here as important.
    <UserButton
      showName
      appearance={{
        elements: {
          rootBox: "flex! w-full!",
          userButtonTrigger:
            "flex! h-11! w-full! items-center! justify-start! gap-2! overflow-hidden! rounded-xl! p-2! text-left! text-sm! text-sidebar-foreground! shadow-none! ring-sidebar-ring! outline-hidden! hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground! focus-visible:ring-2! active:bg-sidebar-accent! active:text-sidebar-accent-foreground! aria-expanded:bg-sidebar-accent! aria-expanded:text-sidebar-accent-foreground! group-data-[collapsible=icon]:h-10! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:p-0!",
          userButtonBox:
            "min-w-0! flex-1! gap-2! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0!",
          userButtonAvatarBox: "order-first! size-6! shrink-0!",
          userButtonOuterIdentifier:
            "truncate! ps-0! text-left! text-sm! font-normal! text-inherit! group-data-[collapsible=icon]:hidden!",
        },
      }}
    >
      <UserButton.MenuItems>
        <UserButton.Action label="manageAccount" />
        <UserButton.Action
          label={
            resolvedTheme === "dark"
              ? "Switch to light theme"
              : "Switch to dark theme"
          }
          labelIcon={
            resolvedTheme === "dark" ? (
              <SunIcon className="size-4" />
            ) : (
              <MoonIcon className="size-4" />
            )
          }
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        />
        <UserButton.Link
          label="Usage"
          labelIcon={<GaugeIcon className="size-4" />}
          href="/usage"
        />
        <UserButton.Action label="signOut" />
        <UserButton.Link
          label="Delete account"
          labelIcon={<Trash2Icon className="size-4" />}
          href="/delete-account"
        />
      </UserButton.MenuItems>
    </UserButton>
  )
}

export { UserMenu }
