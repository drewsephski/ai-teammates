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
const composeDelay = (text: string) =>
  Math.min(1900 + 22 * text.split(" ").length, 3000)

export function useHeroDemo(frame: RefObject<HTMLDivElement | null>) {
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
    if (!element) return
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
        add(index)
        update({ pending: null })
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
            850,
            Math.max(
              320,
              1.05 * Math.hypot(point.x - prior.x, point.y - prior.y)
            )
          )
        )
        update({
          cursor: { ...point, duration, visible: true, clicking: false },
        })
        await delay(duration + 80)
      }
      const click = async (action: () => void) => {
        update({ cursor: { ...current.current.cursor, clicking: true } })
        await delay(140)
        action()
        await delay(180)
        update({ cursor: { ...current.current.cursor, clicking: false } })
      }
      try {
        await delay(1000)
        await delay(250)
        await compose(0, "Spawning")
        await delay(900)
        add(1)
        await delay(500)
        update({ name: "Sales Outbound" })
        add(2)
        await delay(300)
        await compose(3, "Checking connections")
        await delay(350)
        add(4)
        await delay(1400)
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
        await delay(350)
        await move("computer-take-over")
        await click(() => update({ computerStatus: "handed-over" }))
        await delay(220)
        update({ overlay: true })
        await delay(650)
        await move("portal-email", 0.25)
        await click(() =>
          update({
            screen: {
              ...current.current.screen,
              emailChars: 5,
              focus: "email",
            },
          })
        )
        for (const chars of [10, "drew@krafty.ai".length]) {
          update({ screen: { ...current.current.screen, emailChars: chars } })
          await delay(70)
        }
        update({
          screen: {
            ...current.current.screen,
            passwordChars: 9,
            focus: "password",
          },
        })
        await delay(120)
        await move("portal-submit")
        await click(() =>
          update({
            screen: { ...current.current.screen, view: "portal", focus: null },
          })
        )
        await delay(850)
        await move("screen-done")
        await click(() =>
          update({
            overlay: false,
            computerStatus: "working",
            screen: { ...current.current.screen, isWorking: true },
          })
        )
        await delay(400)
        update({ cursor: hiddenCursor })
        await delay(1500)
        await compose(5, "Wrapping the run")
        await delay(800)
        update({
          computerStatus: "done",
          screen: {
            ...current.current.screen,
            view: "settled",
            isWorking: false,
          },
        })
        await delay(700)
        await delay(900)
        add(6)
        await delay(600)
        await compose(7, "Receiving context")
        await delay(900)
        await compose(8, "Drafting")
        await delay(1400)
        add(9)
        await delay(700)
        update({
          entries: current.current.entries.map((entry, index) =>
            index === 9 ? { ...entry, reactions: ["👍"] } : entry
          ),
        })
        await delay(700)
        add(10)
        await delay(300)
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
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.35
        element.toggleAttribute("data-demo-offscreen", !visible)
        if (visible) visibleWaiters.forEach((resolve) => resolve())
        if (visible && !started.current && !current.current.complete) {
          started.current = true
          void run()
        }
      },
      { threshold: [0.0, 0.35] }
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
  }, [frame, finish])

  return { ...state, finish }
}
