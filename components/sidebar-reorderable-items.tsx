"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { motion, Reorder, useReducedMotion } from "motion/react"

import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SidebarDraggableItem } from "@/components/sidebar-draggable-item"

export type SidebarReorderableItem = {
  id: string
  name: string
  content: ReactNode
}

export function SidebarReorderScrollArea({
  children,
}: {
  children: ReactNode
}) {
  return (
    <ScrollArea
      className="min-h-0 flex-1"
      viewportProps={{ render: <motion.div layoutScroll /> }}
    >
      {children}
    </ScrollArea>
  )
}

export function SidebarReorderableItems({
  items,
  version,
  saveOrder,
  label,
  layout = "grid",
}: {
  items: SidebarReorderableItem[]
  version: string
  saveOrder: (ids: string[]) => Promise<void>
  label: string
  layout?: "grid" | "list"
}) {
  const [local, setLocal] = useState(() => ({
    version,
    ids: items.map((item) => item.id),
  }))
  const order =
    local.version === version ? local.ids : items.map((item) => item.id)
  const orderRef = useRef(order)
  const beforeDrag = useRef<{ version: string; ids: string[] } | null>(null)
  const saving = useRef(false)
  const [pending, setPending] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const groupRef = useRef<HTMLUListElement>(null)
  const instructionsId = useId()
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    orderRef.current = order
  }, [order])
  useEffect(
    () => () => {
      beforeDrag.current = null
    },
    [version]
  )

  function updateOrder(ids: string[]) {
    if (
      ids.length !== items.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !items.some((item) => item.id === id))
    )
      return
    orderRef.current = ids
    setLocal({ version, ids })
  }

  async function commit(previous: string[], next: string[]) {
    if (saving.current || previous.every((id, index) => id === next[index]))
      return
    saving.current = true
    setPending(true)
    try {
      await saveOrder(next)
      setAnnouncement("Order saved.")
    } catch {
      updateOrder(previous)
      setAnnouncement("Couldn't save order. Previous order restored.")
      toast.add({
        type: "error",
        title: "Couldn't save order",
        description: "Your previous order was restored. Try again.",
      })
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  function cancel() {
    const previous = beforeDrag.current
    beforeDrag.current = null
    if (previous?.version === version) updateOrder(previous.ids)
    setAnnouncement("Reordering cancelled.")
  }

  function finish(point: { x: number; y: number }) {
    const previous = beforeDrag.current
    beforeDrag.current = null
    if (!previous || previous.version !== version) return
    const bounds = groupRef.current!.getBoundingClientRect()
    const viewport = groupRef
      .current!.closest('[data-slot="scroll-area-viewport"]')
      ?.getBoundingClientRect()
    const inside = (rect: DOMRect) =>
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    if (!inside(bounds) || (viewport && !inside(viewport))) {
      updateOrder(previous.ids)
      setAnnouncement("Reordering cancelled. Drop inside the list.")
      return
    }
    void commit(previous.ids, orderRef.current)
  }

  function move(id: string, key: string) {
    if (saving.current || beforeDrag.current) return
    const previous = orderRef.current
    const index = previous.indexOf(id)
    const columns =
      layout === "grid"
        ? getComputedStyle(groupRef.current!).gridTemplateColumns.split(" ")
            .length
        : 1
    const target =
      key === "Home"
        ? 0
        : key === "End"
          ? previous.length - 1
          : index +
            (key === "ArrowUp"
              ? -columns
              : key === "ArrowDown"
                ? columns
                : key === "ArrowLeft"
                  ? -1
                  : 1)
    if (target < 0 || target >= previous.length || index === target) return
    const next = [...previous]
    next.splice(index, 1)
    next.splice(target, 0, id)
    updateOrder(next)
    setAnnouncement(
      `${items.find((item) => item.id === id)!.name} moved to position ${target + 1} of ${next.length}.`
    )
    void commit(previous, next)
  }

  return (
    <>
      <p id={instructionsId} className="sr-only">
        Drag to reorder. To reorder with a keyboard, focus an item and hold Alt
        while pressing an arrow key, Home, or End. Escape cancels a drag.
      </p>
      <Reorder.Group
        ref={groupRef}
        axis={layout === "grid" ? "xy" : "y"}
        values={order}
        onReorder={(ids) => {
          // Reorder can run before Motion's deferred onDragStart callback.
          if (!beforeDrag.current && !saving.current)
            beforeDrag.current = { version, ids: [...orderRef.current] }
          if (beforeDrag.current?.version === version && !saving.current)
            updateOrder(ids)
        }}
        aria-label={label}
        aria-busy={pending}
        data-slot="sidebar-menu"
        data-sidebar="menu"
        className={cn(
          "relative w-full min-w-0 gap-1",
          layout === "grid"
            ? "grid auto-rows-fr grid-cols-2 group-data-[collapsible=icon]:grid-cols-1 @[220px]:grid-cols-3"
            : "flex flex-col"
        )}
      >
        {order.map((id) => (
          <SidebarDraggableItem
            key={id}
            item={items.find((item) => item.id === id)!}
            groupRef={groupRef}
            disabled={pending || items.length < 2}
            instructionsId={instructionsId}
            reducedMotion={!!reducedMotion}
            version={version}
            onStart={() => {
              beforeDrag.current ??= { version, ids: [...orderRef.current] }
            }}
            onFinish={finish}
            onCancel={cancel}
            onMove={(key) => move(id, key)}
          />
        ))}
      </Reorder.Group>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>
    </>
  )
}
