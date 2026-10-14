"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MenuIcon, XIcon } from "lucide-react"
import styles from "./navigation.module.css"

const navigation = [
  ["Features", "#features"],
  ["Use cases", "#use-cases"],
  ["How it works", "#statement"],
  ["Pricing", "#pricing"],
] as const

export function BotNavigation({ workspaceHref }: { workspaceHref: string }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("keydown", onKey)
    }
  }, [])
  return (
    <header className={styles.header} data-scrolled={scrolled}>
      <div className={styles.bar}>
        <Link href="/" aria-label="Krafty home" className={styles.logo}>
          <Image
            src="/krafty-wordmark.png"
            alt="Krafty"
            width={90}
            height={36}
            preload
          />
        </Link>
        <nav aria-label="Main navigation" className={styles.desktop}>
          {navigation.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          <Link href={workspaceHref} prefetch={false}>
            Workspace
          </Link>
        </nav>
        <div className={styles.actions}>
          <a href="#pricing" className={styles.plans}>
            View plans
          </a>
          <Link href={workspaceHref} prefetch={false} className={styles.start}>
            Open Krafty
          </Link>
          <button
            type="button"
            className={styles.toggle}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile navigation"
          className={styles.mobile}
        >
          {navigation.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          <a href="#pricing" onClick={() => setOpen(false)}>
            View plans
          </a>
          <Link href={workspaceHref} prefetch={false}>
            Open workspace
          </Link>
        </nav>
      )}
    </header>
  )
}
