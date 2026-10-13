"use client"

import { useEffect, useId, useRef } from "react"
import { CHARACTER_GEOMETRY, type CharacterShape } from "./character-geometry"
import {
  BLINK_CADENCE,
  CIRCLE_PATH,
  HEAD_CENTER,
  bodyTargets,
  clamp,
  easeOutCubic,
  gazeEase,
  gazeTarget,
  morphPath,
  pulse,
  seededRandom,
  spring,
  smoothStep,
  stepSpring,
  type CharacterState,
} from "./character-motion"
import { subscribeCharacterFrame } from "./character-runtime"

export function BotMark({
  className,
  color = "currentColor",
  shape = "blob",
  state = "idle",
  active = true,
}: {
  className?: string
  color?: string
  shape?: CharacterShape
  state?: CharacterState
  active?: boolean
}) {
  const svg = useRef<SVGSVGElement>(null)
  const body = useRef<SVGGElement>(null)
  const head = useRef<SVGPathElement>(null)
  const clip = useRef<SVGPathElement>(null)
  const sideDots = useRef<Array<SVGPathElement | null>>([])
  const particles = useRef<Array<SVGCircleElement | null>>([])
  const eyes = useRef<Array<SVGGElement | null>>([])
  const id = useId()
  const geometry = CHARACTER_GEOMETRY[shape]
  const neutralTransform = `translate(${HEAD_CENTER} ${HEAD_CENTER}) scale(${geometry.scale}) translate(${-HEAD_CENTER} ${-HEAD_CENTER})`

  useEffect(() => {
    const element = svg.current
    if (!element) return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const seed = [...id].reduce(
      (value, char) => Math.imul(value, 31) + char.charCodeAt(0),
      1
    )
    const random = seededRandom(seed)
    const rotation = spring()
    const x = spring()
    const y = spring()
    const scaleY = spring(1)
    const lid = spring(1)
    const morph = spring()
    const gaze = { x: 0, y: 0 }
    let bounds = element.getBoundingClientRect()
    let boundsRead = 0
    let elapsed = 0
    let nextBlink = 1500 + random() * 5500
    let blinkStarted = -Infinity
    let doubleBlink = false
    let inView = false
    let unsubscribe: (() => void) | undefined
    let previousMorph = -1

    const reset = () => {
      body.current?.setAttribute("transform", neutralTransform)
      body.current?.removeAttribute("opacity")
      head.current?.setAttribute("d", geometry.head)
      clip.current?.setAttribute("d", geometry.head)
      element.setAttribute("viewBox", "-15 -15 259 259")
      for (const eye of eyes.current) {
        eye?.removeAttribute("transform")
        eye?.removeAttribute("opacity")
      }
      for (const dot of sideDots.current) dot?.setAttribute("opacity", "0")
      for (const particle of particles.current)
        particle?.setAttribute("opacity", "0")
      previousMorph = -1
    }

    const update = (
      time: number,
      dt: number,
      pointer: { x: number; y: number } | null
    ) => {
      elapsed += dt * 1000
      const targets = bodyTargets(state, elapsed / 1000)
      rotation.target = targets.rotation
      x.target = targets.x
      y.target = targets.y
      scaleY.target = targets.scaleY
      stepSpring(rotation, 5, 0.9, dt)
      stepSpring(x, 3.5, 1, dt)
      stepSpring(y, 4, 1, dt)
      stepSpring(scaleY, 10, 0.8, dt)
      const spawnTime = elapsed % 3500
      morph.target = Number(
        state === "thinking" || (state === "spawning" && spawnTime < 2000)
      )
      stepSpring(morph, 14, 1, dt)
      const amount = clamp(morph.position, 0, 1)

      const cadence = BLINK_CADENCE[state]
      if (cadence && elapsed >= nextBlink) {
        blinkStarted = elapsed
        doubleBlink = random() < 0.14
        const [min, max] = cadence
        nextBlink = elapsed + min + random() * (max - min)
      }
      const blinkTime = elapsed - blinkStarted
      lid.target =
        blinkTime < 150
          ? 0.05
          : blinkTime < 300
            ? 1.08
            : doubleBlink && blinkTime >= 370 && blinkTime < 480
              ? 0.05
              : 1
      stepSpring(lid, 26, 1, dt)

      if (time - boundsRead > 200) {
        bounds = element.getBoundingClientRect()
        boundsRead = time
      }
      const target = gazeTarget(pointer, bounds)
      const ease = gazeEase(dt)
      gaze.x += (target.x - gaze.x) * ease
      gaze.y += (target.y - gaze.y) * ease

      const centerPulse = pulse(elapsed, 1, amount)
      const radius = state === "thinking" ? 22 : 19
      const dotScale =
        (radius / HEAD_CENTER) * (state === "thinking" ? centerPulse.pop : 1)
      const bodyScaleX = geometry.scale * (1 - amount + dotScale * amount)
      const bodyScaleY =
        geometry.scale * (scaleY.position * (1 - amount) + dotScale * amount)
      body.current?.setAttribute(
        "transform",
        `translate(${HEAD_CENTER + x.position * (1 - amount)} ${HEAD_CENTER + y.position * (1 - amount) - centerPulse.lift * amount * Number(state === "thinking")}) rotate(${rotation.position * geometry.tiltScale * (1 - amount)}) scale(${bodyScaleX} ${bodyScaleY}) translate(${-HEAD_CENTER} ${-HEAD_CENTER})`
      )
      body.current?.setAttribute(
        "opacity",
        String(
          1 - (1 - centerPulse.tone) * amount * Number(state === "thinking")
        )
      )
      if (Math.abs(amount - previousMorph) > 0.0005) {
        const path =
          amount > 0.001 ? morphPath(geometry.ring, amount) : geometry.head
        head.current?.setAttribute("d", path)
        clip.current?.setAttribute("d", path)
        previousMorph = amount
      }
      const zoom = state === "thinking" ? 1.5 : 1.15
      const smallMark = 1 - smoothStep(clamp((bounds.width - 44) / 90, 0, 1))
      const halfSize = 129.5 / (1 + (zoom - 1) * amount * smallMark)
      element.setAttribute(
        "viewBox",
        `${114.5 - halfSize} ${114.5 - halfSize} ${halfSize * 2} ${halfSize * 2}`
      )
      sideDots.current.forEach((dot, index) => {
        if (!dot) return
        const progress = clamp(
          (amount - 0.12 * index) / (1 - 0.12 * index),
          0,
          1
        )
        const eased = easeOutCubic(progress)
        const overshoot =
          1 + 2.70158 * (progress - 1) ** 3 + 1.70158 * (progress - 1) ** 2
        const dotPulse = pulse(elapsed, index ? 2 : 0, amount)
        const scale = ((22 * eased * dotPulse.pop) / HEAD_CENTER) * 1.02
        dot.setAttribute(
          "transform",
          `translate(${HEAD_CENTER + (index ? 62 : -62) * overshoot} ${HEAD_CENTER - dotPulse.lift}) scale(${scale * geometry.scale}) translate(${-HEAD_CENTER} ${-HEAD_CENTER})`
        )
        dot.setAttribute(
          "opacity",
          String(state === "thinking" ? eased * dotPulse.tone : 0)
        )
      })
      particles.current.forEach((particle, index) => {
        if (!particle) return
        const progress = clamp((spawnTime / 2000 - 0.09 * index) / 0.62, 0, 1)
        const ease = easeOutCubic(progress)
        const angle = 2.4 * index + 2.2 * progress
        const distance = 96 * (1 - ease)
        particle.setAttribute(
          "cx",
          String(HEAD_CENTER + distance * Math.cos(angle))
        )
        particle.setAttribute(
          "cy",
          String(HEAD_CENTER + distance * Math.sin(angle) * 0.8)
        )
        particle.setAttribute(
          "r",
          String(9 * (0.5 + 0.5 * ease) * easeOutCubic(amount))
        )
        particle.setAttribute(
          "opacity",
          String(
            state === "spawning" && progress < 1
              ? easeOutCubic(amount) *
                  clamp(5 * progress, 0, 1) *
                  (1 - 0.25 * ease)
              : 0
          )
        )
      })
      geometry.eyes.forEach((eye, index) => {
        const driftX =
          1.4 * Math.sin(0.00042 * elapsed + index) +
          0.5 * Math.sin(0.001 * elapsed + 2 * index)
        const driftY = 0.9 * Math.sin(0.00058 * elapsed + index)
        const dx = (gaze.x + driftX) * geometry.face.sx
        const dy = (gaze.y + driftY) * geometry.face.sy
        eyes.current[index]?.setAttribute(
          "transform",
          `translate(${eye.cx + dx} ${eye.cy + dy}) scale(1 ${Math.max(lid.position, 0.04)}) translate(${-eye.cx} ${-eye.cy})`
        )
        eyes.current[index]?.setAttribute(
          "opacity",
          String(amount >= 0.5 ? 0 : 1)
        )
      })
    }

    const sync = () => {
      const shouldAnimate = active && inView && !media.matches
      if (shouldAnimate && !unsubscribe)
        unsubscribe = subscribeCharacterFrame(update)
      else if (!shouldAnimate) {
        unsubscribe?.()
        unsubscribe = undefined
        reset()
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false
      sync()
    })
    observer.observe(element)
    media.addEventListener("change", sync)
    sync()
    return () => {
      unsubscribe?.()
      observer.disconnect()
      media.removeEventListener("change", sync)
      reset()
    }
  }, [active, geometry, id, neutralTransform, state])

  return (
    <svg
      ref={svg}
      aria-hidden="true"
      viewBox="-15 -15 259 259"
      className={className}
      style={{ color }}
      data-state={state}
      data-shape={shape}
    >
      <defs>
        <clipPath id={`${id}-face`}>
          <path ref={clip} d={geometry.head} />
        </clipPath>
      </defs>
      {[0, 1].map((index) => (
        <path
          key={`dot-${index}`}
          ref={(element) => {
            sideDots.current[index] = element
          }}
          fill="currentColor"
          d={CIRCLE_PATH}
          opacity="0"
        />
      ))}
      {[0, 1, 2, 3, 4].map((index) => (
        <circle
          key={`particle-${index}`}
          ref={(element) => {
            particles.current[index] = element
          }}
          fill="currentColor"
          cx={HEAD_CENTER}
          cy={HEAD_CENTER}
          r="0"
          opacity="0"
        />
      ))}
      <g ref={body} transform={neutralTransform}>
        <path ref={head} fill="currentColor" d={geometry.head} />
        <g clipPath={`url(#${id}-face)`}>
          {geometry.eyes.map((eye, index) => (
            <g
              key={index}
              ref={(element) => {
                eyes.current[index] = element
              }}
            >
              <path
                fill="var(--bg, #0a0a0c)"
                d={eye.path}
                style={{ transition: "fill .6s" }}
              />
            </g>
          ))}
        </g>
      </g>
    </svg>
  )
}
