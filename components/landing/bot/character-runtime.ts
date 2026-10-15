type Frame = (
  time: number,
  dt: number,
  pointer: { x: number; y: number } | null
) => void

const frames = new Set<Frame>()
let pointer: { x: number; y: number } | null = null
let frameId = 0
let previousTime: number | null = null

function tick(time: number) {
  frameId = 0
  const dt =
    previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1)
  previousTime = time
  for (const frame of frames) frame(time, dt, pointer)
  if (frames.size && !document.hidden) frameId = requestAnimationFrame(tick)
}

// A finger only counts while it is down, since touch screens have no hover.
let touching = false

function move(event: PointerEvent) {
  if (event.pointerType !== "touch" || touching)
    pointer = { x: event.clientX, y: event.clientY }
}

function press(event: PointerEvent) {
  if (event.pointerType !== "touch") return
  touching = true
  pointer = { x: event.clientX, y: event.clientY }
}

function release(event: PointerEvent) {
  if (event.pointerType !== "touch") return
  touching = false
  pointer = null
}

// Presses are tracked before any character animates, because the press that
// wakes an avatar reaches the window before its frame subscribes.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", press, { passive: true })
  window.addEventListener("pointerup", release, { passive: true })
  window.addEventListener("pointercancel", release, { passive: true })
}

function leave() {
  touching = false
  pointer = null
}

function visibility() {
  cancelAnimationFrame(frameId)
  frameId = 0
  previousTime = null
  if (!document.hidden && frames.size) frameId = requestAnimationFrame(tick)
}

// Every visible character shares one pointer listener and one animation clock.
export function subscribeCharacterFrame(frame: Frame) {
  if (!frames.size) {
    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("blur", leave)
    document.documentElement.addEventListener("pointerleave", leave)
    document.addEventListener("visibilitychange", visibility)
  }
  frames.add(frame)
  if (!frameId && !document.hidden) frameId = requestAnimationFrame(tick)
  return () => {
    frames.delete(frame)
    if (frames.size) return
    cancelAnimationFrame(frameId)
    frameId = 0
    previousTime = null
    pointer = null
    window.removeEventListener("pointermove", move)
    window.removeEventListener("blur", leave)
    document.documentElement.removeEventListener("pointerleave", leave)
    document.removeEventListener("visibilitychange", visibility)
  }
}
