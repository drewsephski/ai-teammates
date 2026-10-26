"use client"

import { useEffect, useRef, type ReactNode } from "react"

// Touch screens have no hover, so each step plays its preview while it is
// mostly on screen instead. The step's CSS treats data-active like :hover.
export function StepsInView({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const element = list.current
    if (!element || !window.matchMedia("(hover: none)").matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const step = entry.target as HTMLElement
          if (entry.isIntersecting) step.dataset.active = ""
          else delete step.dataset.active
        }
      },
      { threshold: 0.6 }
    )
    for (const step of element.children) observer.observe(step)
    return () => observer.disconnect()
  }, [])

  return (
    <ol ref={list} className={className}>
      {children}
    </ol>
  )
}
