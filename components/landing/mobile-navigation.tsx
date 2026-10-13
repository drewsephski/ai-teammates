"use client"

import Link from "next/link"
import { useRef } from "react"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import styles from "./landing.module.css"

export function MobileNavigation({ workspaceHref }: { workspaceHref: string }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)

  return (
    <details
      ref={menu}
      className={styles.mobileMenu}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          menu.current.open = false
          trigger.current?.focus()
        }
      }}
    >
      <summary ref={trigger} aria-label="Navigation menu">
        <span>Menu</span>
        <AnimatedArrow direction="disclosure" size={15} />
      </summary>
      <nav
        aria-label="Mobile navigation"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a") && menu.current) {
            menu.current.open = false
          }
        }}
      >
        <a href="#features">Features</a>
        <a href="#use-cases">Use cases</a>
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Pricing</a>
        <a href="#faq">FAQs</a>
        <Link href={workspaceHref} prefetch={false}>
          Open workspace
        </Link>
      </nav>
    </details>
  )
}
