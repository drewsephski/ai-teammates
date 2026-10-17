import Link from "next/link"
import { formatDistanceToNowStrict } from "date-fns"

import { listApprovalRules } from "@/actions/approvals"
import { ApprovalRules } from "@/components/activity/approval-rules"
import { RoutineDialog } from "@/components/activity/routine-dialog"
import { RoutineList } from "@/components/activity/routine-list"
import { AppPageHeader } from "@/components/app-page-header"
import { ApprovalCard } from "@/components/approval-card"
import { ChatAvatar } from "@/components/chat-avatar"
import { getSignedInActivity } from "@/queries/activity"
import { getBots } from "@/queries/bots"

export default async function Page() {
  const [{ approvals, routines, events, bots: named }, bots, rules] =
    await Promise.all([getSignedInActivity(), getBots(), listApprovalRules()])
  const botFor = (id: string | null) => named.find((bot) => bot.id === id)

  return (
    <section>
      <AppPageHeader title="Activity" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Activity
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            What your teammates do on their own: requests waiting for you, the
            routines they run, and what happened while you were away.
          </p>
        </div>

        <section aria-labelledby="waiting" className="flex flex-col gap-3">
          <h2 id="waiting" className="text-lg font-medium">
            Waiting for you
          </h2>
          {approvals.length ? (
            <ul className="flex flex-col gap-3">
              {approvals.map((approval) => {
                const bot = botFor(approval.botId)
                return (
                  <li key={approval.id} className="flex flex-col gap-2">
                    <Link
                      href={`/chats/${approval.chatId}`}
                      className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {bot && (
                        <ChatAvatar
                          seed={bot.avatar}
                          identity={bot.id}
                          className="size-5"
                        />
                      )}
                      {bot?.name ?? "A bot"} ·{" "}
                      {formatDistanceToNowStrict(approval.createdAt, {
                        addSuffix: true,
                      })}
                    </Link>
                    <ApprovalCard
                      approvalId={approval.id}
                      summary={approval.summary}
                      toolkit={approval.toolkit}
                    />
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Nothing needs your approval. When a bot wants to send, post or
              delete something, it waits here and on your phone.
            </p>
          )}
        </section>

        <section
          aria-labelledby="always-allowed"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h2 id="always-allowed" className="text-lg font-medium">
              Always allowed
            </h2>
            <p className="text-sm text-muted-foreground">
              Actions you let a bot take without asking each time.
            </p>
          </div>
          <ApprovalRules rules={rules} />
        </section>

        <section aria-labelledby="routines" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="routines" className="text-lg font-medium">
              Routines
            </h2>
            <RoutineDialog
              bots={bots.map(({ id, name }) => ({ id, name }))}
              timezones={Intl.supportedValuesOf("timeZone")}
            />
          </div>
          <RoutineList routines={routines} bots={bots} />
        </section>

        <section aria-labelledby="recent" className="flex flex-col gap-3">
          <h2 id="recent" className="text-lg font-medium">
            Recent
          </h2>
          {events.length ? (
            <ul className="flex flex-col">
              {events.map((event) => {
                const bot = botFor(event.botId)
                const body = (
                  <>
                    {bot ? (
                      <ChatAvatar
                        seed={bot.avatar}
                        identity={bot.id}
                        className="size-6 shrink-0"
                      />
                    ) : (
                      <span className="size-6 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {event.title}
                      </span>
                      {event.detail && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {event.detail}
                        </span>
                      )}
                    </span>
                    <time
                      dateTime={event.createdAt.toISOString()}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {formatDistanceToNowStrict(event.createdAt, {
                        addSuffix: true,
                      })}
                    </time>
                  </>
                )
                return (
                  <li key={event.id}>
                    {event.chatId ? (
                      <Link
                        href={`/chats/${event.chatId}`}
                        className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2.5">
                        {body}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              Nothing yet. Routine runs, finished work and questions from your
              bots show up here.
            </p>
          )}
        </section>
      </div>
    </section>
  )
}
