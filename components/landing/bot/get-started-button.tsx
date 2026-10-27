"use client"

import Link from "next/link"
import { useRef } from "react"
import { AirplaneIcon, type AirplaneIconHandle } from "@/components/ui/airplane"
import styles from "./bot-landing.module.css"

export function GetStartedButton({
  href,
  label = "Try Krafty free",
}: {
  href: string
  label?: string
}) {
  const airplane = useRef<AirplaneIconHandle>(null)

  return (
    <Link
      href={href}
      prefetch={false}
      className={styles.button}
      onMouseEnter={() => airplane.current?.startAnimation()}
      onMouseLeave={() => airplane.current?.stopAnimation()}
      onFocus={() => airplane.current?.startAnimation()}
      onBlur={() => airplane.current?.stopAnimation()}
    >
      <AirplaneIcon
        ref={airplane}
        size={17}
        className="inline-flex shrink-0"
        aria-hidden="true"
      />
      {label}
    </Link>
  )
}
