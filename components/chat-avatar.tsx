import Image from "next/image"
import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json" with { type: "json" }
import { cn } from "cn"
import { BotMark } from "@/components/landing/bot/bot-mark"
import { parseBotAvatar } from "@/lib/bot-avatar"

const style = new Style(definition)

function ChatAvatar({
  seed,
  animated = false,
  className,
}: {
  seed: string
  animated?: boolean
  className?: string
}) {
  const blob = parseBotAvatar(seed)
  if (blob)
    return (
      <span
        data-slot="chat-avatar"
        className={cn("block size-8 shrink-0 [--bg:var(--sidebar)]", className)}
      >
        <BotMark
          shape={blob.shape}
          color={blob.color}
          active={animated}
          className="size-full"
        />
      </span>
    )
  const avatar = new Avatar(style, {
    seed,
    ...(animated && { tags: ["animation"] }),
  })

  return (
    <Image
      data-slot="chat-avatar"
      src={avatar.toDataUri()}
      alt=""
      width={32}
      height={32}
      unoptimized
      className={cn("size-8 shrink-0", className)}
    />
  )
}

export { ChatAvatar }
