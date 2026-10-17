import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"
import { GaugeIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { usesOwnModel } from "@/lib/ai-provider"
import { getUsage } from "@/lib/usage"
import { usageNotice, usageNoticeCopy } from "@/lib/usage-notice"
import { cn } from "@/lib/utils"

// Says how much allowance is left before it runs out, rather than only after.
// The agent enforces the limits itself, so a failed lookup just shows nothing.
async function UsageNotice() {
  const { userId } = await auth()
  if (!userId) return null

  let usage: Awaited<ReturnType<typeof getUsage>>
  let ownModel: boolean
  try {
    ;[usage, ownModel] = await Promise.all([
      getUsage(userId),
      usesOwnModel(userId),
    ])
  } catch (error) {
    Sentry.logger.warn("Usage notice unavailable", {
      "user.id": userId,
      "error.message": error instanceof Error ? error.message : String(error),
    })
    return null
  }

  const notice = usageNotice(usage, { chatgptSelected: ownModel })
  if (!notice) return null
  const { message, action } = usageNoticeCopy(notice, usage)

  return (
    <div
      role="status"
      data-slot="usage-notice"
      data-level={notice.level}
      className="mb-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 py-1.5 pr-1.5 pl-3 text-xs text-muted-foreground"
    >
      <GaugeIcon
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0",
          notice.level === "out" && "text-destructive"
        )}
      />
      <span className="min-w-0 flex-1">{message}</span>
      <Link
        href={action.href}
        className={buttonVariants({ variant: "ghost", size: "xs" })}
      >
        {action.label}
      </Link>
    </div>
  )
}

export { UsageNotice }
