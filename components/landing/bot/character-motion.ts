export type CharacterState =
  | "idle"
  | "thinking"
  | "working"
  | "listening"
  | "spawning"
  | "celebrate"
  | "waking"
  | "curious"
  | "bored"
  | "happy"
  | "playful"

export type CharacterSequence = "hero" | "footer"
export const CHARACTER_SEQUENCES: Record<
  CharacterSequence,
  readonly { state: CharacterState; ms: number }[]
> = {
  hero: [
    { state: "waking", ms: 2200 },
    { state: "idle", ms: 6800 },
    { state: "happy", ms: 3200 },
    { state: "idle", ms: 7400 },
    { state: "curious", ms: 3600 },
  ],
  footer: [
    { state: "idle", ms: 7000 },
    { state: "curious", ms: 4200 },
    { state: "idle", ms: 6200 },
    { state: "bored", ms: 4600 },
    { state: "idle", ms: 6800 },
    { state: "happy", ms: 4200 },
    { state: "idle", ms: 6400 },
    { state: "playful", ms: 4400 },
  ],
}

export function sequenceState(sequence: CharacterSequence, elapsed: number) {
  const all = CHARACTER_SEQUENCES[sequence]
  const initial = all.reduce((total, phase) => total + phase.ms, 0)
  let time = elapsed
  let phases = all
  if (sequence === "hero" && elapsed >= initial) {
    phases = all.slice(1)
    time = (elapsed - initial) % (initial - all[0].ms)
  } else time %= initial
  for (const phase of phases) {
    if (time < phase.ms) return { state: phase.state, stateTime: time }
    time -= phase.ms
  }
  return { state: phases[0].state, stateTime: 0 }
}

export const HEAD_CENTER = 114.2705
export const BLINK_CADENCE: Record<
  CharacterState,
  readonly [number, number] | null
> = {
  idle: [6000, 14000],
  thinking: [3500, 7000],
  working: [2800, 5500],
  listening: [3000, 7000],
  spawning: null,
  celebrate: [2200, 4500],
  waking: null,
  curious: [2500, 5500],
  bored: [4000, 8000],
  happy: [2500, 5000],
  playful: [2000, 4500],
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function gazeTarget(
  pointer: { x: number; y: number } | null,
  bounds: { left: number; top: number; width: number; height: number }
) {
  if (!pointer || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 }
  return {
    x:
      22 *
      clamp(
        (pointer.x - bounds.left - bounds.width / 2) / bounds.width,
        -0.6,
        0.6
      ),
    y:
      14 *
      clamp(
        (pointer.y - bounds.top - bounds.height / 2) / bounds.height,
        -0.6,
        0.6
      ),
  }
}

export function gazeEase(dt: number) {
  return 1 - Math.exp(60 * Math.log(0.84) * dt)
}

export type Spring = { position: number; velocity: number; target: number }
export function spring(value = 0): Spring {
  return { position: value, velocity: 0, target: value }
}

// Source physics uses semi-implicit Euler, subdivided at 120 Hz.
export function stepSpring(
  value: Spring,
  frequency: number,
  damping: number,
  dt: number
) {
  const steps = Math.max(1, Math.ceil(dt * 120))
  const step = dt / steps
  for (let index = 0; index < steps; index++) {
    value.velocity +=
      (-2 * damping * frequency * value.velocity -
        frequency ** 2 * (value.position - value.target)) *
      step
    value.position += value.velocity * step
  }
  if (!Number.isFinite(value.position) || !Number.isFinite(value.velocity)) {
    value.position = value.target
    value.velocity = 0
  }
}

export function bodyTargets(
  state: CharacterState,
  seconds: number,
  stateSeconds = seconds
) {
  if (state === "waking") {
    if (stateSeconds < 0.75)
      return {
        rotation: 0,
        x: 0,
        y: 4 - 10 * clamp(stateSeconds / 0.75, 0, 1),
        scaleY: 1.02,
      }
    if (stateSeconds < 1.45) return { rotation: 0, x: 0, y: 0, scaleY: 1 }
    const progress = Math.min((stateSeconds - 1.45) / 0.65, 1)
    return {
      rotation: 6 * Math.sin(progress * Math.PI * 3) * (1 - progress),
      x: 0,
      y: 2 * Math.sin(0.9 * seconds),
      scaleY: 1,
    }
  }
  if (state === "happy") {
    const beat = Math.sin(2.4 * seconds)
    return {
      rotation: 3 * Math.sin(1.2 * seconds),
      x: 2.5 * Math.sin(1.1 * seconds),
      y: -3 * Math.abs(beat),
      scaleY: 1 + 0.02 * beat,
    }
  }
  if (state === "curious")
    return {
      rotation: 10 + 6 * Math.sin(0.7 * seconds),
      x: 5 * Math.sin(0.6 * seconds),
      y: -2 + 1.5 * Math.sin(0.9 * seconds),
      scaleY: 1.01,
    }
  if (state === "bored")
    return {
      rotation: -3 + 4 * Math.sin(0.25 * seconds),
      x: 4 * Math.sin(0.2 * seconds),
      y: 5 + 1.5 * Math.sin(0.35 * seconds),
      scaleY: 0.99,
    }
  if (state === "playful")
    return {
      rotation: 8 * Math.sin(1.4 * seconds),
      x: 4 * Math.sin(1.1 * seconds),
      y: -3 * Math.abs(Math.sin(2.2 * seconds)),
      scaleY: 1 + 0.015 * Math.sin(2.2 * seconds),
    }
  if (state === "thinking")
    return {
      rotation: -9 + 5 * Math.sin(0.35 * seconds),
      x: 5 * Math.sin(0.3 * seconds),
      y: 2.5 * Math.sin(0.6 * seconds),
      scaleY: 1,
    }
  if (state === "working") {
    const beat = Math.sin(seconds * Math.PI * 3.2)
    return {
      rotation: 4 + 2.5 * beat,
      x: 3,
      y: 1.5 + 3 * Math.max(0, beat),
      scaleY: 1 - 0.02 * Math.max(0, beat),
    }
  }
  if (state === "listening")
    return {
      rotation: 8 + 1.5 * Math.sin(0.5 * seconds),
      x: 2,
      y: -2 + 0.8 * Math.sin(0.8 * seconds),
      scaleY: 1.015,
    }
  if (state === "spawning") return { rotation: 0, x: 0, y: 0, scaleY: 1 }
  if (state === "celebrate")
    return {
      rotation: 0,
      x: 0,
      y: -2.5 * Math.abs(Math.sin(1.6 * seconds)),
      scaleY: 1,
    }
  return {
    rotation: 1.5 * Math.sin(0.5 * seconds) + 0.6 * Math.sin(0.17 * seconds),
    x: Math.sin(0.27 * seconds),
    y: 1.2 * Math.sin(0.85 * seconds),
    scaleY: 1 + 0.007 * Math.sin(0.85 * seconds),
  }
}

export function seededRandom(seed: number) {
  let value = Math.floor(seed) >>> 0 || 1
  return () => {
    let result = (value += 0x6d2b79f5)
    result = Math.imul(result ^ (result >>> 15), 1 | result)
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result)
    return ((result ^ (result >>> 14)) >>> 0) / 0x100000000
  }
}

export function wanderGaze(state: CharacterState, random: () => number) {
  const range = (min: number, max: number) => min + random() * (max - min)
  const sign = () => (random() < 0.5 ? -1 : 1)
  if (state === "idle") return { x: 0, y: 0, ms: range(2500, 5500) }
  if (state === "curious")
    return {
      x: sign() * range(0.6, 1) * 15,
      y: 9 * range(-1, 1),
      ms: range(950, 1900),
    }
  if (state === "bored")
    return {
      x: sign() * range(0.7, 1) * 15,
      y: 9 * range(0.4, 0.9),
      ms: range(3000, 6000),
    }
  if (state === "happy")
    return {
      x: 15 * range(-0.7, 0.7),
      y: -9 * range(0, 0.6),
      ms: range(1800, 3400),
    }
  if (state === "playful")
    return {
      x: sign() * range(0.5, 1) * 15,
      y: -9 * range(0, 0.6),
      ms: range(900, 1800),
    }
  if (state === "working")
    return {
      x: 15 * range(-0.4, 0.4),
      y: 9 * range(0.4, 1),
      ms: range(1200, 2400),
    }
  if (state === "listening")
    return {
      x: 15 * range(-0.3, 0.3),
      y: 9 * range(-0.25, 0.25),
      ms: range(2200, 4200),
    }
  if (state === "thinking")
    return {
      x: sign() * range(0.5, 1) * 15,
      y: -9 * range(0.4, 1),
      ms: range(1500, 2800),
    }
  return {
    x: 15 * range(-0.4, 0.4),
    y: 9 * range(-0.3, 0.3),
    ms: range(2500, 5000),
  }
}

export function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3
}

export function smoothStep(value: number) {
  return value * value * (3 - 2 * value)
}

export function pulse(time: number, index: number, amount: number) {
  let phase = Math.abs(((time / 1400 + 0.119) % 1) - index / 3)
  phase = Math.min(phase, 1 - phase)
  const strength = Math.exp(-(phase * phase) / 0.045)
  return {
    lift: 9 * strength * amount,
    pop: 0.84 + 0.22 * strength,
    tone: 0.5 + 0.5 * strength,
  }
}

function ringOutline(points: readonly (readonly number[])[]) {
  const round = (value: number) => Math.round(value * 100) / 100
  const count = points.length
  let path = `M${round(points[0][0])} ${round(points[0][1])}`
  for (let index = 0; index < count; index++) {
    const previous = points[(index - 1 + count) % count]
    const current = points[index]
    const next = points[(index + 1) % count]
    const after = points[(index + 2) % count]
    path += `C${round(current[0] + (next[0] - previous[0]) / 6)} ${round(current[1] + (next[1] - previous[1]) / 6)} ${round(next[0] - (after[0] - current[0]) / 6)} ${round(next[1] - (after[1] - current[1]) / 6)} ${round(next[0])} ${round(next[1])}`
  }
  return path + "Z"
}

export const CIRCLE_RING = Array.from({ length: 96 }, (_, index) => {
  const angle = (index / 96) * Math.PI * 2
  return [
    HEAD_CENTER + HEAD_CENTER * Math.cos(angle),
    HEAD_CENTER + HEAD_CENTER * Math.sin(angle),
  ]
})

export const CIRCLE_PATH = ringOutline(CIRCLE_RING)

export function morphPath(
  ring: readonly (readonly number[])[],
  amount: number
) {
  const progress = clamp(amount / 0.62, 0, 1)
  const ease =
    progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
  if (ease >= 1) return CIRCLE_PATH
  return ringOutline(
    ring.map((point, index) => [
      point[0] + (CIRCLE_RING[index][0] - point[0]) * ease,
      point[1] + (CIRCLE_RING[index][1] - point[1]) * ease,
    ])
  )
}
