"use client"

import { useState } from "react"
import { BellIcon, XIcon } from "lucide-react"

import { dismissNotice } from "@/actions/notices"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

type WorkspaceNotice = { id: string; title: string; body: string | null }

// Messages for the person, shown until they dismiss them (services/notices.ts)
export function WorkspaceNotices({ notices }: { notices: WorkspaceNotice[] }) {
  const [hidden, setHidden] = useState<string[]>([])
  const visible = notices.filter((notice) => !hidden.includes(notice.id))
  if (!visible.length) return null

  async function dismiss(id: string) {
    setHidden((ids) => [...ids, id])
    try {
      await dismissNotice(id)
    } catch {
      setHidden((ids) => ids.filter((hiddenId) => hiddenId !== id))
      toast.add({
        type: "error",
        title: "Couldn't hide the message",
        description: "Try again.",
      })
    }
  }

  return (
    <div className="space-y-3">
      {visible.map((notice) => (
        <Alert key={notice.id} role="status" className="px-4 py-3">
          <BellIcon />
          <AlertTitle>{notice.title}</AlertTitle>
          {notice.body && <AlertDescription>{notice.body}</AlertDescription>}
          <AlertAction>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => dismiss(notice.id)}
            >
              <XIcon />
            </Button>
          </AlertAction>
        </Alert>
      ))}
    </div>
  )
}
