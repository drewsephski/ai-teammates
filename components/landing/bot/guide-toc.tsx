"use client"

import { useEffect, useState } from "react"

import styles from "./guide-page.module.css"

type Item = { id: string; title: string }

/** "On this page" rail that highlights the section being read. */
export function GuideToc({ items }: { items: readonly Item[] }) {
  const [current, setCurrent] = useState(items[0]?.id)

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null)
    if (sections.length === 0) return
    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting)
        }
        const first = sections.find((section) => visible.get(section.id))
        if (first) setCurrent(first.id)
      },
      { rootMargin: "-20% 0px -65% 0px" }
    )
    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label="On this page" className={styles.toc}>
      <p className={styles.tocHeading}>On this page</p>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={item.id === current ? "location" : undefined}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
