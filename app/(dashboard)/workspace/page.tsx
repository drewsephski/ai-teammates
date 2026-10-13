import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import {
  ArrowUpRightIcon,
  BrainIcon,
  MonitorIcon,
  UsersIcon,
} from "lucide-react"

import { AppPageHeader } from "@/components/app-page-header"
import { CreateBotButton } from "@/components/create-bot-button"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { buttonVariants } from "@/components/ui/button"
import { botPresets } from "@/lib/bot-presets"
import { getBots, getChats } from "@/queries/bots"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  await auth.protect()
  const [params, bots, chats] = await Promise.all([
    searchParams,
    getBots(),
    getChats(),
  ])
  const preset = botPresets.find((preset) => preset.id === params.role)
  const directChats = chats.filter((chat) => chat.kind === "direct")
  const groupChats = chats.filter((chat) => chat.kind === "group")
  const conversationHref = directChats[0]
    ? `/chats/${directChats[0].id}`
    : "#teammates"

  return (
    <section>
      <AppPageHeader title="Workspace">
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Krafty home <ArrowUpRightIcon />
        </Link>
      </AppPageHeader>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
              Your workspace
            </h1>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Give your next idea a teammate.
            </p>
          </div>
          <BotMark
            shape="blob"
            state="curious"
            color="var(--foreground)"
            className="size-20 shrink-0 [--bg:var(--card)] sm:size-24"
          />
        </header>
        {preset && (
          <section className="flex flex-col items-start gap-5 rounded-2xl bg-muted p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <h2 className="text-lg font-medium">
                Get started with {preset.label.toLowerCase()}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {preset.description} Your teammate starts with this role’s
                instructions; you can customize everything.
              </p>
            </div>
            <CreateBotButton key={preset.id} presetId={preset.id}>
              Create your {preset.job.toLowerCase()}
            </CreateBotButton>
          </section>
        )}
        <section id="teammates" className="scroll-mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium">
              {bots.length ? "Your teammates" : "Meet your first teammate"}
            </h2>
            <CreateBotButton>Create a teammate</CreateBotButton>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Each teammate has a name, a role, saved memory, and a computer.
            Teammates and computers require a paid plan.
          </p>
          {directChats.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {directChats.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chats/${chat.id}`}
                  className="group flex min-w-0 items-center gap-4 rounded-2xl bg-muted/60 p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <ChatAvatar seed={chat.bots[0].avatar} className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{chat.bots[0].name}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {chat.bots[0].job}
                    </p>
                  </div>
                  <ArrowUpRightIcon className="size-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <div
              className="mt-6 flex flex-wrap gap-2"
              aria-label="Starting roles"
            >
              {botPresets.map((role) => (
                <CreateBotButton
                  key={role.id}
                  presetId={role.id}
                  variant="outline"
                >
                  <role.icon /> {role.label}
                </CreateBotButton>
              ))}
            </div>
          )}
        </section>
        <section id="groups" className="scroll-mt-6 border-t pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium">Group chats & handoffs</h2>
            <GroupChatDialog
              bots={bots.map(({ id, name, avatar }) => ({ id, name, avatar }))}
            >
              <UsersIcon /> Create a group chat
            </GroupChatDialog>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Bring specialists into one conversation. Teammates can hand a
            request to the person with the right role. You need at least two
            teammates to create a group.
          </p>
          {groupChats.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {groupChats.map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chats/${chat.id}`}
                  className="group flex min-w-0 items-center gap-4 rounded-2xl bg-muted/60 p-5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <GroupChatAvatar
                    seeds={chat.bots.map((bot) => bot.avatar)}
                    className="size-12"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {chat.name}
                  </span>
                  <ArrowUpRightIcon className="size-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              ))}
            </div>
          )}
        </section>
        <div className="grid gap-8 border-t pt-8 md:grid-cols-2">
          <section id="computer" className="scroll-mt-6">
            <MonitorIcon className="mb-4 size-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">
              Cloud computers & live desktop
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Open a teammate’s chat and select Desktop to watch its computer.
              Ask it to browse, run commands, or work with files. Your computer
              is paused when idle; active viewing counts toward sandbox usage.
            </p>
            <Link
              href={conversationHref}
              className={`${buttonVariants({ variant: "outline" })} mt-5`}
            >
              {directChats[0]
                ? "Open a teammate’s chat"
                : "Create your first teammate"}
              <ArrowUpRightIcon />
            </Link>
          </section>
          <section id="memory" className="scroll-mt-6">
            <BrainIcon className="mb-4 size-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">
              Memory, files & ongoing work
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Ask a teammate to remember your preferences or save a note. Its
              saved memory and computer files stay with it across conversations.
              Active tasks can continue when you close the tab.
            </p>
            <Link
              href={conversationHref}
              className={`${buttonVariants({ variant: "outline" })} mt-5`}
            >
              {directChats[0]
                ? "Continue a conversation"
                : "Create your first teammate"}
              <ArrowUpRightIcon />
            </Link>
          </section>
        </div>
        <footer className="flex flex-wrap gap-3 border-t pt-6">
          <Link href="/usage" className={buttonVariants({ variant: "ghost" })}>
            View usage
          </Link>
          <Link
            href="/pricing"
            className={buttonVariants({ variant: "ghost" })}
          >
            Plans & billing
          </Link>
        </footer>
      </div>
    </section>
  )
}
