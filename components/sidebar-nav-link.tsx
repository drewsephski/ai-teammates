"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

export function SidebarNavLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const active = pathname === href
  return (
    <SidebarMenuButton
      tooltip={label}
      isActive={active}
      className="h-10 rounded-xl"
      render={<Link href={href} aria-current={active ? "page" : undefined} />}
      onClick={() => {
        if (isMobile) setOpenMobile(false)
      }}
    >
      {children}
      <span>{label}</span>
    </SidebarMenuButton>
  )
}
