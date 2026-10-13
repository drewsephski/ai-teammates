"use client"

import { cn } from "@/lib/utils"
import { motion, useReducedMotion } from "motion/react"
import type { ComponentPropsWithRef, CSSProperties, ElementType } from "react"
import { memo, useMemo } from "react"

function ShimmerElement({
  as: Component,
  ...props
}: ComponentPropsWithRef<"p"> & { as: ElementType }) {
  return <Component {...props} />
}

// A stable motion component keeps the shimmer running across chat renders.
const MotionText = motion.create(ShimmerElement)

export interface TextShimmerProps {
  children: string
  as?: ElementType
  className?: string
  duration?: number
  spread?: number
  baseColor?: string
  shimmerColor?: string
  style?: CSSProperties
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  baseColor,
  shimmerColor,
  style,
}: TextShimmerProps) => {
  const reducedMotion = useReducedMotion()

  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  )

  return (
    <MotionText
      as={Component}
      animate={reducedMotion ? false : { backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-size-[250%_100%,auto] bg-clip-text",
        "[-webkit-text-fill-color:transparent]",
        "[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]",
        className
      )}
      initial={reducedMotion ? false : { backgroundPosition: "100% center" }}
      style={
        {
          ...style,
          "--spread": `${dynamicSpread}px`,
          "--base-color":
            baseColor ?? "color-mix(in oklab, currentColor 55%, transparent)",
          "--base-gradient-color": shimmerColor ?? "currentColor",
          backgroundImage:
            "var(--bg), linear-gradient(var(--base-color), var(--base-color))",
          ...(reducedMotion && {
            backgroundImage: "none",
            WebkitTextFillColor: "currentColor",
          }),
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </MotionText>
  )
}

export const TextShimmer = memo(ShimmerComponent)
export const Shimmer = TextShimmer
