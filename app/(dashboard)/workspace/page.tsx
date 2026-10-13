import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import {
  ArrowUpRightIcon,
  MonitorIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 p-6 py-10">
      <header className="flex items-center gap-3">
        <SidebarTrigger />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Your workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Give your next idea a teammate.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Krafty home
        </Link>
      </header>
      {preset && (
        <section className="rounded-xl border bg-muted/40 p-6">
          <h2 className="text-xl font-semibold">
            Get started with {preset.label.toLowerCase()}
          </h2>
          <p className="mt-2 mb-5 text-muted-foreground">
            {preset.description} Your teammate starts with this role’s
            instructions; you can customize everything.
          </p>
          <BotDialog key={preset.id} presetId={preset.id} trigger={<Button />}>
            <PlusIcon /> Create your {preset.job.toLowerCase()}
          </BotDialog>
        </section>
      )}
      <section id="teammates" className="scroll-mt-6 rounded-xl border p-6">
        <h2 className="text-xl font-semibold">
          {bots.length ? "Your teammates" : "Meet your first teammate"}
        </h2>
        <p className="mt-2 mb-5 text-muted-foreground">
          Each teammate has a name, a role, saved memory, and a computer.
          Teammates and computers require a paid plan.
        </p>
        <BotDialog trigger={<Button />}>
          <PlusIcon /> Create a teammate
        </BotDialog>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {directChats.map((chat) => (
            <Link
              key={chat.id}
              href={`/chats/${chat.id}`}
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChatAvatar seed={chat.bots[0].avatar} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{chat.bots[0].name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {chat.bots[0].job}
                </p>
              </div>
              <ArrowUpRightIcon className="size-4" />
            </Link>
          ))}
        </div>
      </section>
      <section id="groups" className="scroll-mt-6 rounded-xl border p-6">
        <h2 className="text-xl font-semibold">Group chats & handoffs</h2>
        <p className="mt-2 mb-5 text-muted-foreground">
          Bring specialists into one conversation. Teammates can hand a request
          to the person with the right role. You need at least two teammates to
          create a group.
        </p>
        <GroupChatDialog
          bots={bots.map(({ id, name, avatar }) => ({ id, name, avatar }))}
        >
          <UsersIcon /> Create a group chat
        </GroupChatDialog>
        {chats
          .filter((chat) => chat.kind === "group")
          .map((chat) => (
            <Link
              key={chat.id}
              href={`/chats/${chat.id}`}
              className="mt-4 block text-sm underline underline-offset-4"
            >
              {chat.name}
            </Link>
          ))}
      </section>
      <section id="computer" className="scroll-mt-6 rounded-xl border p-6">
        <MonitorIcon className="mb-3 size-5" />
        <h2 className="text-xl font-semibold">
          Cloud computers & live desktop
        </h2>
        <p className="mt-2 text-muted-foreground">
          Open a teammate’s chat and select Desktop to watch its computer. Ask
          it to browse, run commands, or work with files. Your computer is
          paused when idle; active viewing counts toward sandbox usage.
        </p>
        <Link
          href={directChats[0] ? `/chats/${directChats[0].id}` : "#teammates"}
          className={`${buttonVariants({ variant: "outline" })} mt-5`}
        >
          {directChats[0]
            ? "Open a teammate’s chat"
            : "Create your first teammate"}
        </Link>
      </section>
      <section id="memory" className="scroll-mt-6 rounded-xl border p-6">
        <h2 className="text-xl font-semibold">Memory, files & ongoing work</h2>
        <p className="mt-2 text-muted-foreground">
          Ask a teammate to remember your preferences or save a note. Its saved
          memory and computer files stay with it across conversations. Active
          tasks can continue when you close the tab.
        </p>
        <Link
          href={directChats[0] ? `/chats/${directChats[0].id}` : "#teammates"}
          className={`${buttonVariants({ variant: "outline" })} mt-5`}
        >
          {directChats[0]
            ? "Continue a conversation"
            : "Create your first teammate"}
        </Link>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href="/usage" className={buttonVariants({ variant: "outline" })}>
          View usage
        </Link>
        <Link
          href="/pricing"
          className={buttonVariants({ variant: "outline" })}
        >
          Plans & billing
        </Link>
      </div>
    </main>
  )
}
