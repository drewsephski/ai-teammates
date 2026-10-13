import { spring, stepSpring, type CharacterState } from "./character-motion"

const BOUNCES = [
  { height: 48, seconds: 0.5 },
  { height: 28, seconds: 0.382 },
  { height: 14, seconds: 0.27 },
  { height: 6, seconds: 0.177 },
]

type Reaction = {
  kind: "spinBounce" | "spinDizzy"
  started: number
  direction: number
  turns: number
}
export function createCharacterReactions(random: () => number) {
  const range = (min: number, max: number) => min + random() * (max - min)
  const direction = () => (random() < 0.5 ? 1 : -1)
  let nextReaction = range(2500, 5000)
  let nextWorkingSpin = Infinity
  let previousState: CharacterState | null = null
  let turn: ReturnType<typeof spring> | null = null
  let reaction: Reaction | null = null
  let bounceStarted = -Infinity
  const bounceDuration =
    BOUNCES.reduce((total, bounce) => total + bounce.seconds, 0) * 1000
  const startTurn = (sign = direction()) => {
    if (turn) return
    turn = spring()
    turn.target = Math.PI * 2 * sign
  }
  const startReaction = (kind: Reaction["kind"], time: number) => {
    if (reaction) return
    reaction = {
      kind,
      started: time,
      direction: direction(),
      turns: kind === "spinDizzy" ? Math.round(range(3, 4)) : 1,
    }
  }
  return (state: CharacterState, time: number, dt: number) => {
    if (state !== previousState) {
      previousState = state
      nextWorkingSpin =
        state === "working" ? time + range(1200, 2400) : Infinity
    }
    if (time >= nextReaction) {
      if (!turn && !reaction && time - bounceStarted >= bounceDuration) {
        if (state === "happy") {
          if (random() < 0.55) startTurn()
          else startReaction("spinBounce", time)
        } else if (state === "playful") {
          const chance = random()
          if (chance < 0.34) startReaction("spinBounce", time)
          else if (chance < 0.62) bounceStarted = time
          else if (chance < 0.86) startReaction("spinDizzy", time)
          else startTurn()
        }
      }
      nextReaction = time + range(9000, 18000)
    }
    if (time >= nextWorkingSpin) {
      startTurn(1)
      nextWorkingSpin = time + range(6000, 9000)
    }
    let spin: number | null = null
    let x = 0,
      y = 0,
      rotation = 0
    let lid: number | undefined, eyeSize: number | undefined
    if (turn) {
      stepSpring(turn, 6.2, 1, dt)
      spin = turn.position
      if (
        Math.abs(turn.target - turn.position) < 0.004 &&
        Math.abs(turn.velocity) < 0.015
      ) {
        turn = null
        spin = null
      }
    }
    if (reaction) {
      const seconds = (time - reaction.started) / 1000
      if (reaction.kind === "spinBounce") {
        if (seconds < 0.7) {
          const progress = seconds / 0.7
          const ease =
            progress < 0.5
              ? 4 * progress ** 3
              : 1 - (-2 * progress + 2) ** 3 / 2
          spin = Math.PI * 2 * reaction.direction * ease
        } else {
          bounceStarted = time
          reaction = null
        }
      } else {
        const duration = 0.55 + 0.16 * reaction.turns
        if (seconds < duration)
          spin =
            reaction.turns *
            Math.PI *
            2 *
            reaction.direction *
            (seconds / duration) ** 2
        else if (seconds < duration + 1.5) {
          const rest = seconds - duration
          const strength = (1 - rest / 1.5) ** 1.3
          rotation = 17 * Math.sin(10 * rest) * reaction.direction * strength
          x = 10 * Math.cos(10 * rest) * reaction.direction * strength
          y = 3 * Math.sin(20 * rest) * strength
          lid = 0.46 + 0.14 * Math.sin(21 * rest)
          eyeSize = 1.03
        } else reaction = null
      }
    }
    let remaining = (time - bounceStarted) / 1000
    for (const bounce of BOUNCES) {
      if (remaining < bounce.seconds) {
        const phase = remaining / bounce.seconds
        y -= 4 * bounce.height * phase * (1 - phase)
        break
      }
      remaining -= bounce.seconds
    }
    return { spin, x, y, rotation, lid, eyeSize }
  }
}
