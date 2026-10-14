import { CHARACTER_GEOMETRY, type CharacterShape } from "./character-geometry"
import { clamp, type CharacterState } from "./character-motion"

export function avatarScale(shape: CharacterShape) {
  const geometry = CHARACTER_GEOMETRY[shape]
  const area = Math.abs(
    geometry.ring.reduce((sum, point, index, ring) => {
      const next = ring[(index + 1) % ring.length]
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0) / 2
  )
  return Math.min(1.13, Math.sqrt(42000 / area))
}

export function avatarBodyTargets(
  state: CharacterState,
  seconds: number,
  stateSeconds: number
) {
  if (state === "idle") return { rotation: 0, x: 0, y: 0, scaleY: 1 }
  if (state === "happy") {
    const nod = Math.sin(clamp(stateSeconds / 0.7, 0, 1) * Math.PI)
    return { rotation: 3 * nod, x: 0, y: 5 * nod, scaleY: 1 - 0.015 * nod }
  }
  if (state === "thinking")
    return {
      rotation: -4 + Math.sin(seconds * 0.55),
      x: 0,
      y: Math.sin(seconds * 0.8),
      scaleY: 1,
    }
  if (state === "working") {
    const beat = Math.sin(seconds * 3)
    return {
      rotation: 1.5 * beat,
      x: 0,
      y: 1.8 * beat,
      scaleY: 1 + 0.009 * beat,
    }
  }
  if (state === "curious") return { rotation: 5, x: 0, y: 0, scaleY: 1 }
  return {
    rotation: 0.7 * Math.sin(seconds * 0.7),
    x: 0,
    y: Math.sin(seconds * 1.5),
    scaleY: 1 + 0.008 * Math.sin(seconds * 1.5),
  }
}

export function characterSeed(identity: string) {
  return [...identity].reduce(
    (value, char) => Math.imul(value, 31) + char.charCodeAt(0),
    1
  )
}
