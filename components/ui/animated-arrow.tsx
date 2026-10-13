"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"
import { ArrowDownIcon } from "@/components/ui/arrow-down"
import {
  ArrowRightIcon,
  type ArrowRightIconHandle,
} from "@/components/ui/arrow-right"
import { ArrowUpIcon } from "@/components/ui/arrow-up"
import { ArrowUpRightIcon } from "@/components/ui/arrow-up-right"
import { ChevronDownIcon } from "@/components/ui/chevron-down"
import { ChevronRightIcon } from "@/components/ui/chevron-right"
import styles from "./animated-arrow.module.css"

const icons = {
  right: ArrowRightIcon,
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  diagonal: ArrowUpRightIcon,
  chevron: ChevronRightIcon,
  disclosure: ChevronDownIcon,
}

export function AnimatedArrow({
  direction = "right",
  size = 16,
}: {
  direction?: keyof typeof icons
  size?: number
}) {
  const Icon = icons[direction]
  const container = useRef<HTMLSpanElement>(null)
  const animation = useRef<ArrowRightIconHandle>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const target =
      container.current?.closest("a, button, summary") ?? container.current
    if (!target) return
    const start = () => {
      if (!reducedMotion) animation.current?.startAnimation()
    }
    const stop = () => animation.current?.stopAnimation()
    target.addEventListener("mouseenter", start)
    target.addEventListener("mouseleave", stop)
    target.addEventListener("focusin", start)
    target.addEventListener("focusout", stop)
    return () => {
      target.removeEventListener("mouseenter", start)
      target.removeEventListener("mouseleave", stop)
      target.removeEventListener("focusin", start)
      target.removeEventListener("focusout", stop)
    }
  }, [direction, reducedMotion])

  return (
    <span
      ref={container}
      className={styles.arrow}
      data-direction={direction}
      aria-hidden="true"
    >
      <Icon ref={animation} size={size} className="inline-flex" />
    </span>
  )
}
