"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import {
  animate,
  Reorder,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from "motion/react"
import { cn } from "@/lib/utils"
import type { SidebarReorderableItem } from "@/components/sidebar-reorderable-items"

const spring = { type: "spring", stiffness: 420, damping: 36 } as const

export function SidebarDraggableItem({
  item,
  groupRef,
  disabled,
  instructionsId,
  reducedMotion,
  version,
  onStart,
  onFinish,
  onCancel,
  onMove,
}: {
  item: SidebarReorderableItem
  groupRef: RefObject<HTMLUListElement | null>
  disabled: boolean
  instructionsId: string
  reducedMotion: boolean
  version: string
  onStart: () => void
  onFinish: (point: { x: number; y: number }) => void
  onCancel: () => void
  onMove: (key: string) => void
}) {
  const controls = useDragControls()
  const x = useMotionValue(0),
    y = useMotionValue(0)
  const dragged = useRef(false)
  const active = useRef(false)
  const [draggingVersion, setDraggingVersion] = useState<string | null>(null)
  const transition = reducedMotion ? { duration: 0 } : spring

  function cancel() {
    if (!active.current) return
    controls.cancel()
    active.current = false
    setDraggingVersion(null)
    if (reducedMotion) {
      x.jump(0)
      y.jump(0)
    } else {
      animate(x, 0, transition)
      animate(y, 0, transition)
    }
    onCancel()
  }

  useEffect(
    () => () => {
      controls.cancel()
      if (active.current) {
        active.current = false
        x.jump(0)
        y.jump(0)
      }
    },
    [controls, version, x, y]
  )

  return (
    <Reorder.Item
      value={item.id}
      layout="position"
      dragListener={false}
      dragControls={controls}
      dragConstraints={groupRef}
      dragElastic={0}
      dragMomentum={false}
      dragTransition={{
        bounceStiffness: 600,
        bounceDamping: 40,
        ...(reducedMotion ? { timeConstant: 1 } : {}),
      }}
      style={{ x, y, touchAction: disabled ? "pan-y" : "none" }}
      transition={transition}
      whileDrag={{
        boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
      }}
      data-item-id={item.id}
      data-dragging={draggingVersion === version || undefined}
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      aria-describedby={instructionsId}
      className={cn(
        "group/menu-item [&_a]:cursor-inherit relative min-w-0 rounded-xl bg-sidebar select-none",
        draggingVersion === version && "bg-sidebar-accent",
        !disabled && "cursor-grab active:cursor-grabbing"
      )}
      onPointerDown={(event) => {
        if (
          disabled ||
          event.button !== 0 ||
          !event.isPrimary ||
          (event.target as HTMLElement).closest(
            'button, input, textarea, [role="menu"]'
          )
        )
          return
        dragged.current = false
        controls.start(event, { distanceThreshold: 6 })
      }}
      onDragStart={() => {
        active.current = true
        dragged.current = true
        setDraggingVersion(version)
        onStart()
      }}
      onDragEnd={(event, info: PanInfo) => {
        if (!active.current) return
        if (event.type === "pointercancel") {
          cancel()
          return
        }
        active.current = false
        setDraggingVersion(null)
        if (reducedMotion) {
          x.jump(0)
          y.jump(0)
        }
        onFinish({
          x: info.point.x - window.scrollX,
          y: info.point.y - window.scrollY,
        })
      }}
      onPointerCancel={cancel}
      onDragStartCapture={(event) => event.preventDefault()}
      onClickCapture={(event) => {
        if (!dragged.current || event.detail === 0) return
        event.preventDefault()
        event.stopPropagation()
        dragged.current = false
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          cancel()
          return
        }
        if (
          !disabled &&
          event.altKey &&
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(event.key)
        ) {
          event.preventDefault()
          onMove(event.key)
        }
      }}
    >
      {item.content}
    </Reorder.Item>
  )
}
