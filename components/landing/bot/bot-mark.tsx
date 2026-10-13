"use client"

import { useEffect, useId, useMemo, useRef } from "react"
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
  sequenceState,
  type CharacterSequence,
  wanderGaze,
  type CharacterState,
} from "./character-motion"
import {
  EXPRESSION_CADENCE,
  EXPRESSION_POOLS,
  expressionPair,
  interpolateEyes,
  paintEyes,
} from "./character-eyes"
import { subscribeCharacterFrame } from "./character-runtime"
import { createCharacterBurst } from "./character-burst"
import { createCharacterReactions } from "./character-reactions"
import { createCharacterTrails } from "./character-trails"

export function BotMark({
  className,
  color = "currentColor",
  shape = "blob",
  state = "idle",
  active = true,
  sequence,
}: {
  className?: string
  color?: string
  shape?: CharacterShape
  state?: CharacterState
  active?: boolean
  sequence?: CharacterSequence
}) {
  const svg = useRef<SVGSVGElement>(null)
  const body = useRef<SVGGElement>(null)
  const head = useRef<SVGPathElement>(null)
  const clip = useRef<SVGPathElement>(null)
  const sideDots = useRef<Array<SVGPathElement | null>>([])
  const particles = useRef<Array<SVGCircleElement | null>>([])
  const eyes = useRef<Array<SVGGElement | null>>([])
  const eyePaths = useRef<Array<SVGPathElement | null>>([])
  const confetti = useRef<SVGGElement>(null)
  const trailsBack = useRef<SVGGElement>(null)
  const trailsFront = useRef<SVGGElement>(null)
  const id = useId()
  const geometry = CHARACTER_GEOMETRY[shape]
  const initialState = sequence ? sequenceState(sequence, 0).state : state
  const initialEyes = useMemo(
    () =>
      active
        ? paintEyes(
            expressionPair(initialState, EXPRESSION_POOLS[initialState][0]),
            shape,
            initialState
          )
        : geometry.eyes,
    [active, initialState, shape, geometry]
  )
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
    const bursts = confetti.current
      ? createCharacterBurst(confetti.current, random, HEAD_CENTER)
      : null
    const react = createCharacterReactions(random)
    const trails =
      trailsBack.current && trailsFront.current
        ? createCharacterTrails(
            trailsBack.current,
            trailsFront.current,
            id,
            random
          )
        : null
    let wakingBurst = false
    const rotation = spring()
    const x = spring()
    const y = spring()
    const scaleY = spring(1)
    const lid = spring(1)
    const morph = spring()
    const gaze = { x: 0, y: 0 }
    const wanderX = spring()
    const wanderY = spring()
    let nextWander = 500 + random() * 900
    let nextNod = 1200 + random() * 1000
    let nextSigh = 500 + random() * 700
    let nodStarted = -Infinity
    let sighStarted = -Infinity
    let currentState = initialState
    let stateStarted = 0
    let expressionIndex = 0
    let expressionFrom = expressionPair(
      currentState,
      EXPRESSION_POOLS[currentState][0]
    )
    let expressionTo = expressionFrom
    const expression = spring(1)
    const eyeSize = spring(1)
    let expressionFrequency = 8
    let nextExpression =
      EXPRESSION_CADENCE[currentState][0] +
      random() *
        (EXPRESSION_CADENCE[currentState][1] -
          EXPRESSION_CADENCE[currentState][0])
    let nextWink = 3000 + random() * 5000
    let winkStarted = -Infinity
    let winkEye = 0
    let bounds = element.getBoundingClientRect()
    let boundsRead = 0
    let elapsed = 0
    let nextBlink = 1500 + random() * 5500
    let blinkStarted = 0
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
      bursts?.clear()
      trails?.clear()
      const stillEyes = media.matches
        ? paintEyes(expressionPair("idle", 0), shape, "idle")
        : initialEyes
      stillEyes.forEach((eye, index) =>
        eyePaths.current[index]?.setAttribute("d", eye.path)
      )
    }

    const update = (
      time: number,
      dt: number,
      pointer: { x: number; y: number } | null
    ) => {
      elapsed += dt * 1000
      const phase = sequence
        ? sequenceState(sequence, elapsed)
        : { state, stateTime: elapsed }
      if (phase.state === "waking" && phase.stateTime > 200 && !wakingBurst) {
        bursts?.burst(9 + random() * 4, 0.8)
        wakingBurst = true
      }
      bursts?.update(dt)
      const reaction = react(phase.state, elapsed, dt)
      const changeExpression = (index: number, frequency: number) => {
        expressionFrom = interpolateEyes(
          expressionFrom,
          expressionTo,
          clamp(expression.position, 0, 1)
        )
        expressionTo = expressionPair(currentState, index)
        expression.position = 0
        expression.velocity = 0
        expression.target = 1
        expressionFrequency = frequency
      }
      if (phase.state !== currentState) {
        currentState = phase.state
        element.dataset.state = currentState
        stateStarted = elapsed - phase.stateTime
        expressionIndex = 0
        changeExpression(EXPRESSION_POOLS[currentState][0], 8)
        const [min, max] = EXPRESSION_CADENCE[currentState]
        nextExpression = elapsed + min + random() * (max - min)
        blinkStarted = currentState === "waking" ? -Infinity : elapsed
        nextBlink = elapsed + 1500 + random() * 5500
        nextWander = elapsed + 500 + random() * 900
        nextNod = elapsed + 1200 + random() * 1000
        nextSigh = elapsed + 500 + random() * 700
      }
      if (currentState === "waking") {
        const index = phase.stateTime < 750 ? 3 : 0
        if (expressionTo !== expressionPair(currentState, index))
          changeExpression(index, phase.stateTime < 750 ? 6.6 : 7)
      } else if (elapsed >= nextExpression) {
        const pool = EXPRESSION_POOLS[currentState]
        expressionIndex =
          (expressionIndex + 1 + Math.floor(random() * (pool.length - 1))) %
          pool.length
        changeExpression(pool[expressionIndex], 6)
        const [min, max] = EXPRESSION_CADENCE[currentState]
        nextExpression = elapsed + min + random() * (max - min)
      }
      stepSpring(expression, expressionFrequency, 1, dt)
      if (
        ["idle", "happy", "curious", "playful"].includes(currentState) &&
        elapsed >= nextWink
      ) {
        winkStarted = elapsed
        winkEye = random() < 0.5 ? 0 : 1
        nextWink = elapsed + 4500 + random() * 5500
      }
      eyeSize.target =
        currentState === "happy"
          ? 1.05
          : currentState === "curious"
            ? 1.08
            : currentState === "bored"
              ? 0.98
              : currentState === "playful"
                ? 1.06
                : currentState === "celebrate"
                  ? 1.1
                  : currentState === "waking" && phase.stateTime < 750
                    ? 1 + 0.08 * clamp(phase.stateTime / 600, 0, 1)
                    : 1
      if (reaction.eyeSize !== undefined) eyeSize.target = reaction.eyeSize
      stepSpring(eyeSize, 9, 0.85, dt)
      const targets = bodyTargets(
        currentState,
        elapsed / 1000,
        (elapsed - stateStarted) / 1000
      )
      if (
        (currentState === "curious" || currentState === "listening") &&
        elapsed >= nextNod
      ) {
        nodStarted = elapsed
        nextNod =
          elapsed +
          (currentState === "curious"
            ? 1600 + random() * 1200
            : 1800 + random() * 1400)
      }
      const nodTime =
        (elapsed - nodStarted) / (currentState === "curious" ? 440 : 380)
      if (nodTime < 1) {
        const nod = Math.sin(nodTime * Math.PI)
        if (currentState === "curious") {
          targets.x += 8 * nod
          targets.rotation += 5 * nod
        }
        if (currentState === "listening") {
          targets.y += 4.5 * nod
          targets.rotation += 2 * nod
        }
      }
      if (currentState === "bored" && elapsed >= nextSigh) {
        sighStarted = elapsed
        nextSigh = elapsed + 4000 + random() * 3000
      }
      const sighTime = (elapsed - sighStarted) / 600
      if (currentState === "bored" && sighTime < 1) {
        const sigh = Math.sin(sighTime * Math.PI)
        targets.scaleY = 1 + 0.05 * sigh
        targets.y += 3 * sigh
      }
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
        currentState === "thinking" ||
          (currentState === "spawning" && spawnTime < 2000)
      )
      stepSpring(morph, 14, 1, dt)
      const amount = clamp(morph.position, 0, 1)

      const cadence = BLINK_CADENCE[currentState]
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
              : currentState === "bored"
                ? 0.8
                : currentState === "celebrate"
                  ? 1.1
                  : 1
      if (reaction.lid !== undefined) lid.target = reaction.lid
      stepSpring(lid, 26, 1, dt)

      if (time - boundsRead > 200) {
        bounds = element.getBoundingClientRect()
        boundsRead = time
      }
      const target = gazeTarget(pointer, bounds)
      trails?.update(
        elapsed,
        dt,
        reaction.spin ?? 0,
        clamp((340 / Math.max(bounds.width, 1)) ** 0.7, 1, 2.6)
      )
      const ease = gazeEase(dt)
      gaze.x += (target.x - gaze.x) * ease
      gaze.y += (target.y - gaze.y) * ease
      if (elapsed >= nextWander) {
        const wander = wanderGaze(currentState, random)
        wanderX.target = wander.x
        wanderY.target = wander.y
        nextWander = elapsed + wander.ms
      }
      stepSpring(wanderX, 13, 1, dt)
      stepSpring(wanderY, 13, 1, dt)

      const centerPulse = pulse(elapsed, 1, amount)
      const radius = currentState === "thinking" ? 22 : 19
      const dotScale =
        (radius / HEAD_CENTER) *
        (currentState === "thinking" ? centerPulse.pop : 1)
      const bodyScaleX = geometry.scale * (1 - amount + dotScale * amount)
      const bodyScaleY =
        geometry.scale * (scaleY.position * (1 - amount) + dotScale * amount)
      body.current?.setAttribute(
        "transform",
        `translate(${HEAD_CENTER + (x.position + reaction.x) * (1 - amount)} ${HEAD_CENTER + (y.position + reaction.y) * (1 - amount) - centerPulse.lift * amount * Number(currentState === "thinking")}) rotate(${(rotation.position + reaction.rotation) * geometry.tiltScale * (1 - amount)}) scale(${bodyScaleX} ${bodyScaleY}) translate(${-HEAD_CENTER} ${-HEAD_CENTER})`
      )
      body.current?.setAttribute(
        "opacity",
        String(
          1 -
            (1 - centerPulse.tone) *
              amount *
              Number(currentState === "thinking")
        )
      )
      if (Math.abs(amount - previousMorph) > 0.0005) {
        const path =
          amount > 0.001 ? morphPath(geometry.ring, amount) : geometry.head
        head.current?.setAttribute("d", path)
        clip.current?.setAttribute("d", path)
        previousMorph = amount
      }
      const zoom = currentState === "thinking" ? 1.5 : 1.15
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
          String(currentState === "thinking" ? eased * dotPulse.tone : 0)
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
            currentState === "spawning" && progress < 1
              ? easeOutCubic(amount) *
                  clamp(5 * progress, 0, 1) *
                  (1 - 0.25 * ease)
              : 0
          )
        )
      })
      const pair = interpolateEyes(
        expressionFrom,
        expressionTo,
        clamp(expression.position, 0, 1)
      )
      const painted = paintEyes(pair, shape, currentState, {
        gazeX: gaze.x + wanderX.position * (pointer ? 0.2 : 1),
        gazeY: gaze.y + wanderY.position * (pointer ? 0.2 : 1),
        time: elapsed,
        lid: lid.position,
        size: eyeSize.position,
        winkIndex: winkEye,
        winkProgress: (elapsed - winkStarted) / 320,
        spin: reaction.spin,
      })
      painted.forEach((eye, index) => {
        eyePaths.current[index]?.setAttribute("d", eye.path)
        eyes.current[index]?.removeAttribute("transform")
        eyes.current[index]?.setAttribute(
          "opacity",
          String(amount >= 0.5 ? 0 : eye.opacity)
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
  }, [
    active,
    geometry,
    id,
    neutralTransform,
    state,
    sequence,
    shape,
    initialState,
    initialEyes,
  ])

  return (
    <svg
      ref={svg}
      aria-hidden="true"
      viewBox="-15 -15 259 259"
      className={className}
      style={{ color, overflow: "visible" }}
      data-state={initialState}
      data-shape={shape}
    >
      <defs>
        <clipPath id={`${id}-face`}>
          <path ref={clip} d={geometry.head} />
        </clipPath>
      </defs>
      <g ref={confetti} />
      <g ref={trailsBack} />
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
          {initialEyes.map((eye, index) => (
            <g
              key={index}
              ref={(element) => {
                eyes.current[index] = element
              }}
            >
              <path
                ref={(element) => {
                  eyePaths.current[index] = element
                }}
                fill="var(--bg, #0a0a0c)"
                d={eye.path}
                style={{ transition: "fill .6s" }}
              />
            </g>
          ))}
        </g>
      </g>
      <g ref={trailsFront} />
    </svg>
  )
}
