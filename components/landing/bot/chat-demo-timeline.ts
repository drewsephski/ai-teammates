"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { heroEntries, type DemoEntry } from "./chat-demo-data"

export type DemoScreen = {
  view: "login" | "portal" | "settled"
  isWorking?: boolean
  emailChars: number
  passwordChars: number
  focus: "email" | "password" | null
}
export type DemoCursor = {
  x: number
  y: number
  duration: number
  visible: boolean
  clicking: boolean
}
type HeroState = {
  entries: DemoEntry[]
  name: string
  pending: string | null
  /** What the person is typing into the composer before a message sends. */
  draft: string
  screen: DemoScreen
  overlay: boolean
  computerStatus: "action-needed" | "handed-over" | "working" | "done"
  cursor: DemoCursor
  complete: boolean
}
const hiddenCursor: DemoCursor = {
  x: 0,
  y: 0,
  duration: 0,
  visible: false,
  clicking: false,
}
const finalState: HeroState = {
  entries: heroEntries,
  name: "Sales Outbound",
  pending: null,
  draft: "",
  screen: { view: "settled", emailChars: 14, passwordChars: 9, focus: null },
  overlay: false,
  computerStatus: "done",
  cursor: hiddenCursor,
  complete: true,
}
const initialState: HeroState = {
  ...finalState,
  entries: [],
  name: "New agent",
  screen: { view: "login", emailChars: 0, passwordChars: 0, focus: null },
  computerStatus: "action-needed",
  complete: false,
}
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length
// How long a Bot "thinks" before a reply lands.
const composeDelay = (text: string) =>
  Math.min(1500 + 25 * wordCount(text), 2600)
// How long a message stays on screen before the next thing happens, so the
// visitor can read it.
const readDelay = (text: string) =>
  Math.min(Math.max(900 + 55 * wordCount(text), 1300), 3200)

export function useHeroDemo(
  frame: RefObject<HTMLDivElement | null>,
  enabled = true
) {
  const [state, setState] = useState(initialState)
  const current = useRef(initialState)
  const controller = useRef<AbortController | null>(null)
  const started = useRef(false)
  const finish = useCallback(() => {
    controller.current?.abort()
    current.current = finalState
    setState(finalState)
  }, [])

  useEffect(() => {
    const element = frame.current
    if (!element || !enabled) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const stopOnInteraction = () => finish()
    const motionChanged = () => {
      if (motion.matches) finish()
    }
    element.addEventListener("pointerdown", stopOnInteraction, {
      capture: true,
    })
    motion.addEventListener("change", motionChanged)
    let visible = false
    const visibleWaiters = new Set<() => void>()
    const pauseWhenHidden = async (signal: AbortSignal) => {
      if (visible || signal.aborted) return
      await new Promise<void>((resolve) => {
        const done = () => {
          visibleWaiters.delete(done)
          signal.removeEventListener("abort", done)
          resolve()
        }
        visibleWaiters.add(done)
        signal.addEventListener("abort", done, { once: true })
      })
    }
    async function run() {
      const abort = new AbortController()
      controller.current = abort
      const { signal } = abort
      const update = (patch: Partial<HeroState>) => {
        if (signal.aborted) return
        current.current = { ...current.current, ...patch }
        setState(current.current)
      }
      const delay = async (ms: number) => {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(done, ms)
          function done() {
            window.clearTimeout(timer)
            signal.removeEventListener("abort", done)
            resolve()
          }
          signal.addEventListener("abort", done, { once: true })
        })
        await pauseWhenHidden(signal)
        if (signal.aborted) throw signal.reason
      }
      const add = (index: number) =>
        update({ entries: [...current.current.entries, heroEntries[index]] })
      const compose = async (index: number, pending: string) => {
        update({ pending })
        await delay(composeDelay(heroEntries[index].text))
        update({ pending: null })
        add(index)
      }
      const read = (index: number) => delay(readDelay(heroEntries[index].text))
      // The person's messages are typed into the composer, then sent.
      const type = async (index: number) => {
        const words = heroEntries[index].text.split(/\s+/).filter(Boolean)
        const step = Math.min(Math.max(1600 / words.length, 45), 110)
        for (let count = 1; count <= words.length; count++) {
          update({ draft: words.slice(0, count).join(" ") })
          await delay(step)
        }
        await delay(450)
        update({ draft: "" })
        add(index)
      }
      const targetPoint = (target: string, fraction = 0.5) => {
        const box = element!.getBoundingClientRect()
        const node = element!.querySelector<HTMLElement>(
          `[data-demo-target="${target}"]`
        )
        if (!node)
          return { x: current.current.cursor.x, y: current.current.cursor.y }
        const rect = node.getBoundingClientRect()
        return {
          x: rect.left - box.left + rect.width * fraction,
          y: rect.top - box.top + rect.height * 0.5,
        }
      }
      const move = async (target: string, fraction = 0.5) => {
        const point = targetPoint(target, fraction)
        const prior = current.current.cursor
        const duration = Math.round(
          Math.min(
            1000,
            Math.max(
              450,
              1.3 * Math.hypot(point.x - prior.x, point.y - prior.y)
            )
          )
        )
        update({
          cursor: { ...point, duration, visible: true, clicking: false },
        })
        await delay(duration + 150)
      }
      const click = async (action: () => void) => {
        update({ cursor: { ...current.current.cursor, clicking: true } })
        await delay(140)
        action()
        await delay(180)
        update({ cursor: { ...current.current.cursor, clicking: false } })
      }
      try {
        await delay(500)
        await compose(0, "Spawning")
        await read(0)
        await type(1)
        await delay(900)
        update({ name: "Sales Outbound" })
        add(2)
        await delay(1000)
        await compose(3, "Checking connections")
        await read(3)
        add(4)
        await read(4)
        const point = targetPoint("computer-take-over")
        update({
          cursor: {
            x: point.x + 56,
            y: point.y + 44,
            duration: 0,
            visible: true,
            clicking: false,
          },
        })
        await delay(400)
        await move("computer-take-over")
        await click(() => update({ computerStatus: "handed-over" }))
        await delay(350)
        update({ overlay: true })
        await delay(1000)
        await move("portal-email", 0.25)
        await click(() =>
          update({
            screen: {
              ...current.current.screen,
              emailChars: 1,
              focus: "email",
            },
          })
        )
        for (let chars = 2; chars <= "drew@kraftybot.app".length; chars += 2) {
          update({ screen: { ...current.current.screen, emailChars: chars } })
          await delay(60)
        }
        await delay(250)
        for (let chars = 1; chars <= 9; chars++) {
          update({
            screen: {
              ...current.current.screen,
              passwordChars: chars,
              focus: "password",
            },
          })
          await delay(55)
        }
        await delay(300)
        await move("portal-submit")
        await click(() =>
          update({
            screen: { ...current.current.screen, view: "portal", focus: null },
          })
        )
        await delay(1300)
        await move("screen-done")
        await click(() =>
          update({
            overlay: false,
            computerStatus: "working",
            screen: { ...current.current.screen, isWorking: true },
          })
        )
        await delay(500)
        update({ cursor: hiddenCursor })
        await delay(1800)
        await compose(5, "Wrapping the run")
        await delay(900)
        update({
          computerStatus: "done",
          screen: {
            ...current.current.screen,
            view: "settled",
            isWorking: false,
          },
        })
        await read(5)
        add(6)
        await delay(700)
        await compose(7, "Receiving context")
        await read(7)
        await compose(8, "Drafting")
        await read(8)
        await type(9)
        await delay(900)
        update({
          entries: current.current.entries.map((entry, index) =>
            index === 9 ? { ...entry, reactions: ["👍"] } : entry
          ),
        })
        await delay(900)
        add(10)
        await delay(700)
        await compose(11, "Thinking")
        update({ complete: true })
      } catch (error) {
        if (!signal.aborted) {
          finish()
          console.error("Krafty landing demo could not finish", error)
        }
      }
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.15
        element.toggleAttribute("data-demo-offscreen", !visible)
        if (visible) visibleWaiters.forEach((resolve) => resolve())
        // Start as soon as any of the demo is on screen, which on most
        // viewports is the moment the page loads.
        if (
          entry.isIntersecting &&
          !started.current &&
          !current.current.complete
        ) {
          started.current = true
          void run()
        }
      },
      { threshold: [0, 0.15] }
    )
    observer.observe(element)
    const reducedTimer = motion.matches
      ? window.setTimeout(finish, 0)
      : undefined
    return () => {
      observer.disconnect()
      controller.current?.abort()
      visibleWaiters.forEach((resolve) => resolve())
      if (reducedTimer !== undefined) window.clearTimeout(reducedTimer)
      element.removeEventListener("pointerdown", stopOnInteraction, {
        capture: true,
      })
      motion.removeEventListener("change", motionChanged)
    }
  }, [frame, finish, enabled])

  return { ...state, finish }
}
