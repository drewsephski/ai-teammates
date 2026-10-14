import "./dom"

let reduced = false
const mediaListeners = new Set<EventListenerOrEventListenerObject>()
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0

Object.defineProperty(document, "hidden", { configurable: true, value: false })
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    get matches() {
      return reduced
    },
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject
    ) => mediaListeners.add(listener),
    removeEventListener: (
      _type: string,
      listener: EventListenerOrEventListenerObject
    ) => mediaListeners.delete(listener),
  }),
})
Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  },
})
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: (id: number) => frames.delete(id),
})

const observers = new Set<AvatarObserver>()
class AvatarObserver {
  target?: Element
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.add(this)
  }
  observe(target: Element) {
    this.target = target
    this.setVisible(true)
  }
  disconnect() {
    observers.delete(this)
  }
  setVisible(visible: boolean) {
    this.callback(
      [
        {
          target: this.target!,
          isIntersecting: visible,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    )
  }
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  configurable: true,
  value: AvatarObserver,
})

export function advanceAvatarFrames(start: number, duration: number) {
  for (let time = start; time <= start + duration; time += 16) {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(time))
  }
}
export function setAvatarReducedMotion(value: boolean) {
  reduced = value
  const event = new Event("change")
  for (const listener of mediaListeners) {
    if (typeof listener === "function") listener(event)
    else listener.handleEvent(event)
  }
}
export function setAvatarsVisible(value: boolean) {
  for (const observer of observers) observer.setVisible(value)
}
export function avatarFrameCount() {
  return frames.size
}
