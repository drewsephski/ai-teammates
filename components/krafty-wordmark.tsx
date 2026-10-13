import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

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
      className="inline-flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span
        className={cn(
          "block w-28 overflow-hidden",
          compact && "group-data-[collapsible=icon]:w-7"
        )}
      >
        <Image
          src="/krafty-wordmark.png"
          alt="Krafty"
          width={1983}
          height={793}
          className="h-auto w-28 max-w-none dark:invert"
          loading="eager"
        />
      </span>
    </Link>
  )
}
