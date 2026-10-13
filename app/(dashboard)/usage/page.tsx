import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { format, formatDistanceToNowStrict } from "date-fns"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { AppPageHeader } from "@/components/app-page-header"
import { getUsage } from "@/lib/usage"

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const hours = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

function UsageMeter({
  title,
  description,
  used,
  limit,
  detail,
}: {
  title: string
  description: string
  used: number
  limit: number
  detail: string
}) {
  const percent = Math.min(100, Math.round((used / limit) * 100))

  return (
    <Card className="rounded-2xl bg-muted/50 py-6 ring-0 [--card-spacing:1.5rem]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{percent}% used</span>
          <span className="text-muted-foreground tabular-nums">{detail}</span>
        </div>
        <Progress value={percent} aria-label={title} />
      </CardContent>
    </Card>
  )
}

export default async function Page() {
  const { userId } = await auth.protect()

  const usage = await getUsage(userId)

  const { period, used, limits } = usage

  return (
    <section>
      <AppPageHeader title="Usage" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Usage
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {period.end ? (
              <>
                Resets in {formatDistanceToNowStrict(period.end)}, on{" "}
                <time dateTime={period.end.toISOString()}>
                  {format(period.end, "MMMM d")}
                </time>
                .
              </>
            ) : (
              "Your free plan includes a one-time $1 AI allowance, one bot, and one connected app. Upgrade for a renewing allowance and cloud computers."
            )}
          </p>
        </div>
        <div className="flex flex-col gap-5">
          <UsageMeter
            title="AI usage"
            description="What your bots' replies cost in model tokens."
            used={used.ai}
            limit={limits.ai}
            detail={`${dollars.format(used.ai / 1_000_000)} of ${dollars.format(limits.ai / 1_000_000)}`}
          />
          {limits.sandbox > 0 && (
            <UsageMeter
              title="Sandbox hours"
              description="The time your bots' sandboxes were running."
              used={used.sandbox}
              limit={limits.sandbox}
              detail={`${hours.format(used.sandbox / 3600)} of ${hours.format(limits.sandbox / 3600)} hours`}
            />
          )}
        </div>
        {usage.tier === "free" && (
          <Link
            href="/pricing"
            className={buttonVariants({ className: "self-start" })}
          >
            See paid plans
          </Link>
        )}
      </div>
    </section>
  )
}
