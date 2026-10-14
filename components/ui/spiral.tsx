"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

function Spiral({
  dots = 8,
  radius = 31.25,
  className,
  ...props
}: React.ComponentProps<"span"> & { dots?: number; radius?: number }) {
  const reducedMotion = useReducedMotion()

  return (
    <span
      role="status"
      className={cn("relative inline-block size-8 shrink-0", className)}
      {...props}
    >
      {Array.from({ length: dots }, (_, index) => {
        const angle = (index / dots) * (2 * Math.PI)

        return (
          <motion.span
            key={index}
            aria-hidden="true"
            className="absolute inline-block rounded-full bg-current"
            style={{
              left: `${50 + radius * Math.cos(angle)}%`,
              top: `${50 + radius * Math.sin(angle)}%`,
              translate: "-50% -50%",
              width: `${150 / dots}%`,
              height: `${150 / dots}%`,
            }}
            animate={
              reducedMotion
                ? { scale: 0.65, opacity: 0.5 }
                : { scale: [0, 1, 0], opacity: [0, 1, 0] }
            }
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    duration: 1.5,
                    repeat: Infinity,
                    delay: (index / dots) * 1.5,
                    ease: "easeInOut",
                  }
            }
          />
        )
      })}
      <span className="sr-only">Loading</span>
    </span>
  )
}

export { Spiral }
