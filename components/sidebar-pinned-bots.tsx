"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { GripVerticalIcon } from "lucide-react"
import {
  Reorder,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react"

import { toast } from "@/components/ui/toast"

export type PinnedBotItem = { id: string; name: string; content: ReactNode }

export function SidebarPinnedBots({
  items,
  version,
  saveOrder,
}: {
  items: PinnedBotItem[]
  version: string
  saveOrder: (ids: string[]) => Promise<void>
}) {
  const [local, setLocal] = useState(() => ({
    version,
    ids: items.map((item) => item.id),
  }))
  const order =
    local.version === version ? local.ids : items.map((item) => item.id)
  const orderRef = useRef(order)
  const beforeDrag = useRef<string[] | null>(null)
  const saving = useRef(false)
  const [pending, setPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const instructionsId = useId()
  const reducedMotion = useReducedMotion()

  // Refreshes can add, remove or reorder pins without remounting focused handles.
  useEffect(() => {
    orderRef.current = order
  }, [order])

  function updateOrder(ids: string[]) {
    const currentIds = new Set(items.map((item) => item.id))
    const next =
      ids.length === currentIds.size && ids.every((id) => currentIds.has(id))
        ? ids
        : items.map((item) => item.id)
    orderRef.current = next
    setLocal({ version, ids: next })
  }

  async function commit(previous: string[], next: string[]) {
    if (saving.current || previous.every((id, i) => id === next[i])) return
    saving.current = true
    setPending(true)
    try {
      await saveOrder(next)
      setAnnouncement("Bot order saved.")
    } catch {
      updateOrder(previous)
      setAnnouncement("Couldn't save bot order. Previous order restored.")
      toast.add({
        type: "error",
        title: "Couldn't save bot order",
        description: "Your previous order was restored. Try again.",
      })
    } finally {
      saving.current = false
      setPending(false)
    }
  }

  function cancelDrag() {
    if (beforeDrag.current) updateOrder(beforeDrag.current)
    beforeDrag.current = null
    setDragging(false)
    setAnnouncement("Reordering cancelled.")
  }

  function finishDrag() {
    const previous = beforeDrag.current
    beforeDrag.current = null
    setDragging(false)
    if (previous) void commit(previous, orderRef.current)
  }

  function move(id: string, key: string) {
    if (saving.current || beforeDrag.current) return
    const previous = orderRef.current
    const index = previous.indexOf(id)
    const target =
      key === "Home"
        ? 0
        : key === "End"
          ? previous.length - 1
          : index + (key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1)
    if (target < 0 || target >= previous.length || target === index) return
    const next = [...previous]
    next.splice(index, 1)
    next.splice(target, 0, id)
    setKeyboard(true)
    updateOrder(next)
    setAnnouncement(
      `${items.find((item) => item.id === id)!.name} moved to position ${target + 1} of ${next.length}.`
    )
    void commit(previous, next)
  }

  return (
    <>
      <p id={instructionsId} className="sr-only">
        Drag to reorder bots, or use the arrow keys to move a bot earlier or
        later. Home moves to the start, End to the end. Escape cancels a drag.
      </p>
      <Reorder.Group
        values={order}
        onReorder={updateOrder}
        aria-label="Pinned bots"
        aria-busy={pending}
        data-slot="sidebar-menu"
        data-sidebar="menu"
        className="grid w-full min-w-0 grid-cols-2 gap-1 group-data-[collapsible=icon]:grid-cols-1 @[220px]:grid-cols-3"
      >
        {order.map((id) => (
          <PinnedBotTile
            key={id}
            item={items.find((item) => item.id === id)!}
            disabled={pending || items.length < 2}
            instructionsId={instructionsId}
            instant={!!reducedMotion || keyboard}
            dragging={dragging}
            onStart={() => {
              beforeDrag.current = [...orderRef.current]
              setKeyboard(false)
              setDragging(true)
            }}
            onEnd={finishDrag}
            onCancel={cancelDrag}
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

function PinnedBotTile({
  item,
  disabled,
  instructionsId,
  instant,
  dragging,
  onStart,
  onEnd,
  onCancel,
  onMove,
}: {
  item: PinnedBotItem
  disabled: boolean
  instructionsId: string
  instant: boolean
  dragging: boolean
  onStart: () => void
  onEnd: () => void
  onCancel: () => void
  onMove: (key: string) => void
}) {
  const controls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  function cancel() {
    controls.cancel()
    x.set(0)
    y.set(0)
    onCancel()
  }
  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={controls}
      style={{ x, y }}
      dragMomentum={false}
      transition={
        instant
          ? { duration: 0 }
          : { type: "spring", duration: 0.25, bounce: 0.1 }
      }
      whileDrag={{ backgroundColor: "var(--sidebar-accent)" }}
      onDragStart={onStart}
      onDragEnd={onEnd}
      onKeyDown={(event) => {
        if (event.key === "Escape" && dragging) {
          event.preventDefault()
          cancel()
        }
      }}
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className="group/menu-item relative rounded-xl bg-sidebar"
    >
      {item.content}
      <button
        type="button"
        aria-label={`Reorder ${item.name}`}
        aria-describedby={instructionsId}
        aria-disabled={disabled || undefined}
        className="absolute top-0 right-0 z-10 flex size-7 touch-none items-center justify-center rounded-md text-muted-foreground opacity-60 outline-none group-data-[collapsible=icon]:size-4 hover:bg-sidebar-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-disabled:cursor-default aria-disabled:opacity-30 [&:not([aria-disabled])]:cursor-grab [&:not([aria-disabled])]:active:cursor-grabbing"
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          controls.start(event)
        }}
        onPointerCancel={cancel}
        onKeyDown={(event) => {
          if (
            disabled ||
            ![
              "ArrowUp",
              "ArrowDown",
              "ArrowLeft",
              "ArrowRight",
              "Home",
              "End",
            ].includes(event.key)
          )
            return
          event.preventDefault()
          onMove(event.key)
        }}
      >
        <GripVerticalIcon aria-hidden="true" className="size-3.5" />
      </button>
    </Reorder.Item>
  )
}
