import type { CSSProperties, ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"
import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json" with { type: "json" }

import page from "./use-cases.module.css"

const avatarStyle = new Style(definition)

type Role = { id: string; name: string; color: string; description: string }

export const roleCover = (id: string) =>
  `/marketing/visuals/use-cases/${id}.webp`

/** A role with its cover illustration; the cover and title link to its page. */
export function RoleCard({
  role,
  title,
  heading: Heading = "h2",
  children,
}: {
  role: Role
  title: string
  heading?: "h2" | "h3"
  children?: ReactNode
}) {
  const href = `/use-cases/${role.id}`
  return (
    <li
      id={role.id}
      className={page.card}
      style={{ "--role-color": role.color } as CSSProperties}
    >
      <Link href={href} className={page.cover} tabIndex={-1} aria-hidden>
        <Image
          src={roleCover(role.id)}
          alt=""
          fill
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px"
          className={page.coverImage}
        />
        <ArrowUpRightIcon size={18} className={page.coverArrow} />
      </Link>
      <div className={page.cardBody}>
        <Heading>
          {/* Isolate DiceBear's SVG styles and render a stable, color-matched identity. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={new Avatar(avatarStyle, {
              seed: role.id,
              bodyColor: [role.color],
              animationVariant: ["none"],
            }).toDataUri()}
            alt=""
            width={36}
            height={36}
            className={page.avatar}
          />
          <Link href={href}>{title}</Link>
        </Heading>
        <p>{role.description}</p>
        {children}
      </div>
    </li>
  )
}
