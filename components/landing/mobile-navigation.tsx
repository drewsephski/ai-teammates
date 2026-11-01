"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import styles from "./landing.module.css"

export function MobileNavigation({ workspaceHref }: { workspaceHref: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={styles.mobileMenu}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <CollapsibleTrigger ref={trigger} aria-label="Navigation menu">
        <span>Menu</span>
        <AnimatedArrow direction="disclosure" size={15} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <nav
          aria-label="Mobile navigation"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) {
              setOpen(false)
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
      </CollapsibleContent>
    </Collapsible>
  )
}
