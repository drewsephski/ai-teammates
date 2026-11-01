"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { useCreateBot } from "@/components/create-bot-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { BotTemplate } from "@/lib/bot-templates"

// Opened by /workspace?create=<id>, where a public page's "Create this Bot"
// link lands. Nothing is created until the person confirms.
export function BotTemplateDialog({ template }: { template: BotTemplate }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const { create, pending } = useCreateBot(template.id)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        // Drop the query, so a refresh or back navigation doesn't reopen it
        if (!next) router.replace(pathname, { scroll: false })
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-3">
          <ChatAvatar seed={template.avatar} className="size-14" />
          <div className="space-y-1">
            <DialogTitle>{template.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">{template.job}</p>
          </div>
          <DialogDescription>{template.summary}</DialogDescription>
        </DialogHeader>
        <section aria-labelledby="bot-template-steps" className="space-y-2">
          <h3 id="bot-template-steps" className="text-sm font-medium">
            What it does
          </h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-foreground/60">
            {template.steps.map((step) => (
              <li key={step}>{step.replace(/\.$/, "")}.</li>
            ))}
          </ol>
        </section>
        <dl className="grid gap-3 text-sm">
          <div className="space-y-0.5">
            <dt className="font-medium">Apps it uses</dt>
            <dd className="text-muted-foreground">
              {template.apps.join(", ")}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="font-medium">When it runs</dt>
            <dd className="text-muted-foreground">{template.schedule}</dd>
          </div>
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">
          You connect each app when the bot first needs it. Anything it writes
          to your apps waits for your approval.
        </p>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" />}
            disabled={pending}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void create()}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
            )}
            Create this bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
