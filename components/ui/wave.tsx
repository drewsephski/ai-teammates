import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"
import styles from "./wave.module.css"

const WAVE_BAR_HEIGHTS = ["50%", "75%", "100%", "75%", "50%"] as const

function Wave({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-[2.5%]", className)}
      {...props}
    >
      {WAVE_BAR_HEIGHTS.map((height, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn("inline-block rounded-full bg-current", styles.bar)}
          style={{
            width: "12.5%",
            height,
            animationDelay: `calc(var(--delay, 100ms) * ${index})`,
          }}
        />
      ))}
      <span className="sr-only">{children ?? "Listening"}</span>
    </span>
  )
}

export { Wave }
export default Wave
