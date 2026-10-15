import { useId } from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

const BLOB =
  "M21.5 37.5C20 28 28 21.5 37 22.5C42 23 45 24 50 22C56 20 63 13 70 13.5C79 14 79.5 25 77.8 37.5C86 41 89 47 88.5 53C88 60 84 64 79.4 66.5C81 74 79 84 68 86C61 87 56 82 51 80.5C45 82 39 87 32 86C21 84 18 75 20.7 66.8C14 63 11.5 57 12 52C12.5 46 16 40 21.5 37.5Z"

/** The Krafty bot as a stitched felt patch: the blob, its eyes and the seam are cut out. */
export function KraftyMark({ className }: { className?: string }) {
  const mask = useId()
  return (
    <svg
      viewBox="8 8 86 84"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
        <path d={BLOB} fill="#fff" />
        <g stroke="#000" strokeLinecap="round">
          <path d="M37.6 45.5 39.4 58.5M62.6 45.5 60.8 58.5" strokeWidth="8.5" />
          <path
            d={BLOB}
            fill="none"
            strokeWidth="2.8"
            strokeDasharray="5 4"
            transform="translate(50 51) scale(.82) translate(-50 -51)"
          />
        </g>
      </mask>
      <rect
        width="100"
        height="100"
        fill="currentColor"
        mask={`url(#${mask})`}
        transform="rotate(-8 50 50)"
      />
    </svg>
  )
}

export function KraftyLogo({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.28em] leading-none font-bold tracking-[-0.045em]",
        className
      )}
    >
      <KraftyMark className="h-[1.1em] w-auto" />
      <span className={cn(compact && "group-data-[collapsible=icon]:hidden")}>
        Krafty
      </span>
    </span>
  )
}

export function KraftyWordmark({
  compact = false,
  href = "/",
}: {
  compact?: boolean
  href?: string
}) {
  return (
    <Link
      href={href}
      aria-label="Krafty home"
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        compact &&
          "group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center"
      )}
    >
      <KraftyLogo compact={compact} className="text-[1.75rem]" />
    </Link>
  )
}
