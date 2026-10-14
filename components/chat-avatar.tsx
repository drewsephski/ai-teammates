"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json" with { type: "json" }
import { cn } from "cn"
import { BotMark } from "@/components/landing/bot/bot-mark"
import type { CharacterState } from "@/components/landing/bot/character-motion"
import { parseBotAvatar } from "@/lib/bot-avatar"
import { avatarIsAnimated, type AvatarState } from "@/lib/avatar-state"

const style = new Style(definition)
const expressions: Record<AvatarState, CharacterState> = {
  idle: "idle",
  queued: "idle",
  thinking: "thinking",
  working: "working",
  responding: "listening",
  waiting: "curious",
  complete: "happy",
  error: "idle",
}

// Choose ink by contrast against the actual body, independent of page theme.
export function avatarInk(color: string) {
  const channels = color
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.179 ? "#111111" : "#fafafa"
}

function ChatAvatar({
  seed,
  animated = false,
  state = animated ? "working" : "idle",
  interactive = false,
  identity,
  className,
}: {
  seed: string
  animated?: boolean
  state?: AvatarState
  interactive?: boolean
  identity?: string
  className?: string
}) {
  const element = useRef<HTMLSpanElement>(null)
  const [interaction, setInteraction] = useState<CharacterState>()
  const [visible, setVisible] = useState(false)
  const [motionAllowed, setMotionAllowed] = useState(false)
  const blob = parseBotAvatar(seed)
  const native = !!blob
  const active = avatarIsAnimated(state) || (state === "idle" && !!interaction)
  const expression =
    state === "idle" && interaction ? interaction : expressions[state]

  useEffect(() => {
    const target = element.current
    if (!target || !active || native) return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setMotionAllowed(!media.matches && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry?.isIntersecting ?? false)
      sync()
    })
    observer.observe(target)
    media.addEventListener("change", sync)
    document.addEventListener("visibilitychange", sync)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", sync)
      document.removeEventListener("visibilitychange", sync)
    }
  }, [active, native])

  useEffect(() => {
    const avatar = element.current
    if (!avatar || !interactive) return
    const target =
      avatar.closest("button, a, [role=button], [role=option]") ?? avatar
    let timer: ReturnType<typeof setTimeout> | undefined
    const enter = (event: Event) => {
      if ((event as PointerEvent).pointerType !== "touch")
        setInteraction("curious")
    }
    const focus = () => setInteraction("listening")
    const leave = () => setInteraction(undefined)
    const acknowledge = () => {
      clearTimeout(timer)
      setInteraction("happy")
      timer = setTimeout(leave, 700)
    }
    const keydown = (event: Event) => {
      const key = (event as KeyboardEvent).key
      if (key === "Enter" || key === " ") acknowledge()
    }
    target.addEventListener("pointerenter", enter)
    target.addEventListener("pointerleave", leave)
    target.addEventListener("focusin", focus)
    target.addEventListener("focusout", leave)
    target.addEventListener("pointerdown", acknowledge)
    target.addEventListener("keydown", keydown)
    return () => {
      clearTimeout(timer)
      target.removeEventListener("pointerenter", enter)
      target.removeEventListener("pointerleave", leave)
      target.removeEventListener("focusin", focus)
      target.removeEventListener("focusout", leave)
      target.removeEventListener("pointerdown", acknowledge)
      target.removeEventListener("keydown", keydown)
    }
  }, [interactive])

  const gaze = useMemo(
    () =>
      native
        ? ""
        : new Avatar(style, {
            seed,
            animationVariant: [
              active && visible && motionAllowed
                ? state === "responding"
                  ? "slowest"
                  : "slow"
                : "none",
            ],
          }).toDataUri(),
    [seed, state, active, visible, motionAllowed, native]
  )

  return (
    <span
      ref={element}
      data-slot="chat-avatar"
      data-state={state}
      data-interactive={interactive || undefined}
      data-reaction={interaction}
      data-renderer={blob ? "native" : "gaze"}
      data-tone={
        blob?.color === "#111111" || blob?.color === "#fafafa"
          ? "neutral"
          : undefined
      }
      aria-hidden="true"
      className={cn("chat-avatar block size-8 shrink-0", className)}
      style={
        blob
          ? ({
              "--bg": avatarInk(blob.color),
              "--avatar-edge": `color-mix(in srgb, ${blob.color} 75%, ${avatarInk(blob.color)})`,
            } as CSSProperties)
          : undefined
      }
    >
      {blob ? (
        <BotMark
          shape={blob.shape}
          color={blob.color}
          state={expression}
          active={active}
          compact
          personality={identity ?? seed}
          className="size-full"
        />
      ) : (
        // An image keeps DiceBear's embedded animation CSS isolated from other avatars.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={gaze} alt="" width={32} height={32} className="size-full" />
      )}
    </span>
  )
}

export { ChatAvatar }
