"use client"

import { useEffect, useRef, type ComponentType, type Ref } from "react"
import { useReducedMotion } from "motion/react"
import { ArrowUpRightIcon } from "@/components/ui/arrow-up-right"
import { CircleHelpIcon } from "@/components/ui/circle-help"
import { ClipboardCheckIcon } from "@/components/ui/clipboard-check"
import { FileCheckIcon } from "@/components/ui/file-check"
import { FileTextIcon } from "@/components/ui/file-text"
import {
  MessageCircleIcon,
  type MessageCircleIconHandle,
} from "@/components/ui/message-circle"
import { SearchIcon } from "@/components/ui/search"
import type { ComposerCommand } from "@/lib/composer"

type CommandIcon = ComponentType<{
  ref?: Ref<MessageCircleIconHandle>
  size?: number
  className?: string
}>

// Lucide Animated registry components, including the already installed arrow.
export const commandIcons = {
  ask: MessageCircleIcon,
  delegate: ArrowUpRightIcon,
  research: SearchIcon,
  plan: ClipboardCheckIcon,
  review: FileCheckIcon,
  summarize: FileTextIcon,
  help: CircleHelpIcon,
} satisfies Record<ComposerCommand, CommandIcon>

export function ComposerCommandIcon({
  icon: Icon,
  active = false,
}: {
  icon: CommandIcon
  active?: boolean
}) {
  const container = useRef<HTMLSpanElement>(null)
  const animation = useRef<MessageCircleIconHandle>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const target = container.current?.closest("button")
    if (!target) return
    const start = () => {
      if (!reducedMotion) animation.current?.startAnimation()
    }
    const stop = () => animation.current?.stopAnimation()
    const settle = () => (active && !reducedMotion ? start() : stop())
    if (active && !reducedMotion) start()
    else stop()
    target.addEventListener("mouseenter", start)
    target.addEventListener("mouseleave", settle)
    target.addEventListener("focusin", start)
    target.addEventListener("focusout", settle)
    return () => {
      target.removeEventListener("mouseenter", start)
      target.removeEventListener("mouseleave", settle)
      target.removeEventListener("focusin", start)
      target.removeEventListener("focusout", settle)
    }
  }, [active, Icon, reducedMotion])

  return (
    <span
      ref={container}
      data-slot="composer-command-icon"
      aria-hidden="true"
      className="inline-flex shrink-0 text-muted-foreground"
    >
      <Icon ref={animation} size={18} className="inline-flex" />
    </span>
  )
}
