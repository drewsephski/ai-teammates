"use client"

import * as React from "react"
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  type HTMLMotionProps,
  type SpringOptions,
} from "motion/react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import styles from "./cursor.module.css"

function cx(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type MouseTrackerContextType = {
  position: { x: number; y: number }
  active: boolean
  wrapperRef: React.RefObject<HTMLDivElement | null>
  pointerRef: React.RefObject<HTMLDivElement | null>
}
const MouseTrackerContext = React.createContext<
  MouseTrackerContextType | undefined
>(undefined)
export function useMouseTracker() {
  const context = React.useContext(MouseTrackerContext)
  if (!context)
    throw new Error("useMouseTracker must be used within MouseTrackerProvider")
  return context
}
export type MouseTrackerProviderProps = React.ComponentProps<"div">
export function MouseTrackerProvider({
  ref,
  children,
  className,
  ...rest
}: MouseTrackerProviderProps) {
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [active, setActive] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const pointerRef = React.useRef<HTMLDivElement>(null)
  React.useImperativeHandle(ref, () => wrapperRef.current!)
  React.useEffect(() => {
    const container = wrapperRef.current?.parentElement
    if (!container) return
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)")
    const move = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === "touch") return
      const bounds = container.getBoundingClientRect()
      // Convert viewport coordinates for previews inside a scaled layout.
      setPosition({
        x:
          ((event.clientX - bounds.left) * container.offsetWidth) /
            bounds.width -
          container.clientLeft,
        y:
          ((event.clientY - bounds.top) * container.offsetHeight) /
            bounds.height -
          container.clientTop,
      })
      setActive(true)
    }
    const clear = () => setActive(false)
    container.addEventListener("pointermove", move)
    container.addEventListener("pointerleave", clear)
    container.addEventListener("pointercancel", clear)
    window.addEventListener("blur", clear)
    fine.addEventListener("change", clear)
    return () => {
      container.removeEventListener("pointermove", move)
      container.removeEventListener("pointerleave", clear)
      container.removeEventListener("pointercancel", clear)
      window.removeEventListener("blur", clear)
      fine.removeEventListener("change", clear)
    }
  }, [])
  return (
    <MouseTrackerContext.Provider
      value={{ position, active, wrapperRef, pointerRef }}
    >
      <div
        ref={wrapperRef}
        data-role="tracker-wrapper"
        data-active={active || undefined}
        aria-hidden="true"
        className={cx(styles.tracker, className)}
        {...rest}
      >
        {children}
      </div>
    </MouseTrackerContext.Provider>
  )
}
export type PointerProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children: React.ReactNode
}
export function Pointer({
  ref,
  className,
  style,
  children,
  ...rest
}: PointerProps) {
  const { position, active, pointerRef } = useMouseTracker()
  const reduced = useReducedMotion()
  React.useImperativeHandle(ref, () => pointerRef.current!)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  React.useEffect(() => {
    x.set(position.x)
    y.set(position.y)
  }, [position, x, y])
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          ref={pointerRef}
          data-role="custom-pointer"
          className={cx(
            "pointer-events-none absolute top-0 left-0 z-50",
            className
          )}
          style={{ x, y, ...style }}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.12 }}
          {...rest}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export type Anchor =
  | "top"
  | "top-left"
  | "top-right"
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "left"
  | "right"
  | "center"
export type PointerFollowerProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children: React.ReactNode
  align?: Anchor
  gap?: number
  transition?: SpringOptions
}
export function PointerFollower({
  ref,
  align = "bottom-right",
  gap = 20,
  transition = { stiffness: 500, damping: 50 },
  children,
  className,
  style,
  ...rest
}: PointerFollowerProps) {
  const { position, active } = useMouseTracker()
  const reduced = useReducedMotion()
  const left = align.includes("left") || align === "left"
  const right = align.includes("right") || align === "right"
  const top = align.includes("top")
  const bottom = align.includes("bottom")
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          ref={ref}
          data-role="pointer-follower"
          className={cx(
            "pointer-events-none absolute top-0 left-0 z-40 w-max font-medium",
            className
          )}
          style={{ ...style }}
          initial={{ opacity: 0 }}
          animate={{
            x: position.x + (left ? -gap : right ? gap : 0),
            y: position.y + (top ? -gap : bottom ? gap : 0),
            opacity: 1,
          }}
          exit={{ opacity: 0 }}
          transition={
            reduced ? { duration: 0 } : { type: "spring", ...transition }
          }
          {...rest}
        >
          <div
            style={{
              transform: `translate(${left ? "-100%" : right ? "0" : "-50%"}, ${top ? "-100%" : bottom ? "0" : "-50%"})`,
            }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
export type {
  MouseTrackerContextType as CursorContextType,
  MouseTrackerProviderProps as CursorProviderProps,
  PointerProps as CursorProps,
  PointerFollowerProps as CursorFollowProps,
}
