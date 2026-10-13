import { CHARACTER_GEOMETRY, type CharacterShape } from "./character-geometry"
import {
  BORED_EXPRESSION,
  EYE_EXPRESSIONS,
  WORKING_EXPRESSIONS,
} from "./character-expressions"
import { HEAD_CENTER, clamp, type CharacterState } from "./character-motion"

export type EyeRing = readonly (readonly number[])[]
export type EyePair = readonly EyeRing[]
export const EXPRESSION_POOLS: Record<CharacterState, readonly number[]> = {
  idle: [0, 8],
  waking: [13],
  thinking: [8, 16, 14, 17, 5],
  working: [7, 16, 11, 10],
  listening: [10, 1, 19],
  spawning: [3, 0],
  celebrate: [2, 8, 17],
  curious: [3, 21, 0, 15],
  bored: [4, 22, 0],
  happy: [2, 11, 17, 19],
  playful: [2, 17, 11, 8],
}
export const EXPRESSION_CADENCE: Record<
  CharacterState,
  readonly [number, number]
> = {
  idle: [9000, 16000],
  waking: [800, 800],
  thinking: [2000, 3600],
  working: [1800, 3200],
  listening: [2800, 5000],
  spawning: [1200, 1200],
  celebrate: [1400, 2600],
  curious: [1800, 3200],
  bored: [3500, 6000],
  happy: [2500, 4500],
  playful: [1500, 3000],
}

export function expressionPair(state: CharacterState, index: number): EyePair {
  if (state === "bored") return BORED_EXPRESSION
  if (state === "working" && index in WORKING_EXPRESSIONS)
    return WORKING_EXPRESSIONS[
      String(index) as keyof typeof WORKING_EXPRESSIONS
    ]
  return EYE_EXPRESSIONS[index]
}

export function interpolateEyes(
  from: EyePair,
  to: EyePair,
  progress: number
): EyePair {
  if (progress <= 0) return from
  if (progress >= 1) return to
  return from.map((ring, eye) => interpolateRing(ring, to[eye], progress))
}

export function centroid(ring: EyeRing) {
  const sum = ring.reduce(
    ([x, y], point) => [x + point[0], y + point[1]],
    [0, 0]
  )
  return [sum[0] / ring.length, sum[1] / ring.length]
}

function fitRing(ring: EyeRing) {
  const [cx, cy] = centroid(ring)
  let xx = 0,
    yy = 0,
    xy = 0
  for (const point of ring) {
    const x = point[0] - cx,
      y = point[1] - cy
    xx += x * x
    yy += y * y
    xy += x * y
  }
  xx /= ring.length
  yy /= ring.length
  xy /= ring.length
  const eigenvalue =
    (xx + yy + Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy * xy))) / 2
  let ux = 1,
    uy = 0
  if (Math.abs(xy) > 1e-9 || Math.abs(xx - yy) > 1e-9) {
    ux = eigenvalue - yy
    uy = xy
    const length = Math.hypot(ux, uy) || 1
    ux /= length
    uy /= length
  } else if (yy > xx) {
    ux = 0
    uy = 1
  }
  if (uy < 0 || (uy === 0 && ux < 0)) {
    ux = -ux
    uy = -uy
  }
  let halfLen = 0,
    halfW = 0
  for (const point of ring) {
    const x = point[0] - cx,
      y = point[1] - cy
    halfLen = Math.max(halfLen, Math.abs(x * ux + y * uy))
    halfW = Math.max(halfW, Math.abs(-x * uy + y * ux))
  }
  return { cx, cy, ux, uy, halfLen, halfW }
}

function interpolateRing(
  from: EyeRing,
  to: EyeRing,
  progress: number
): EyeRing {
  const start = fitRing(from),
    end = fitRing(to)
  const angle = Math.atan2(start.uy, start.ux)
  let difference = Math.atan2(end.uy, end.ux) - angle
  while (difference > Math.PI / 2) difference -= Math.PI
  while (difference < -Math.PI / 2) difference += Math.PI
  const current = angle + difference * progress
  const ux = Math.cos(current),
    uy = Math.sin(current)
  const radius = Math.max(
    0.35,
    start.halfW + (end.halfW - start.halfW) * progress
  )
  const straight =
    Math.max(0, start.halfLen - start.halfW) * (1 - progress) +
    Math.max(0, end.halfLen - end.halfW) * progress
  const cx = start.cx + (end.cx - start.cx) * progress
  const cy = start.cy + (end.cy - start.cy) * progress
  return Array.from({ length: from.length }, (_, index) => {
    const theta = (index / from.length) * Math.PI * 2
    const a = Math.cos(theta) * ux + Math.sin(theta) * uy
    const b = -Math.cos(theta) * uy + Math.sin(theta) * ux
    const candidate = radius / Math.max(Math.abs(b), 1e-6)
    let distance = candidate
    if (
      candidate * Math.abs(a) > straight + 1e-6 ||
      !Number.isFinite(candidate)
    ) {
      const projected = (a >= 0 ? 1 : -1) * straight * a
      distance =
        projected +
        Math.sqrt(Math.max(0, projected ** 2 - straight ** 2 + radius ** 2))
    }
    return [
      cx + distance * a * ux - distance * b * uy,
      cy + distance * a * uy + distance * b * ux,
    ]
  })
}

const SHAPE_SCALES: Partial<Record<CharacterShape, number>> = {
  blob: 0.92,
  pebble: 0.96,
  egg: 0.96,
  squircle: 0.84,
  tablet: 1,
  wedge: 0.94,
  hex: 0.94,
  cloud: 1,
  teardrop: 1,
}

type Boundary = {
  top: number
  bottom: number
  spans: readonly (readonly [number, number])[]
}
const boundaries = new WeakMap<EyeRing, Boundary>()

function boundaryFor(ring: EyeRing): Boundary {
  const cached = boundaries.get(ring)
  if (cached) return cached
  const top = Math.min(...ring.map((point) => point[1]))
  const bottom = Math.max(...ring.map((point) => point[1]))
  const spans = Array.from({ length: 160 }, (_, sample) => {
    const y = top + ((bottom - top) * (sample + 0.5)) / 160
    let left = -Infinity
    let right = Infinity
    for (let index = 0; index < ring.length; index++) {
      const point = ring[index]
      const next = ring[(index + 1) % ring.length]
      if (point[1] <= y === next[1] <= y) continue
      const x =
        point[0] +
        ((next[0] - point[0]) * (y - point[1])) / (next[1] - point[1])
      if (x <= HEAD_CENTER) left = Math.max(left, x)
      else right = Math.min(right, x)
    }
    return [
      Number.isFinite(left) ? left : HEAD_CENTER,
      Number.isFinite(right) ? right : HEAD_CENTER,
    ] as const
  })
  const result = { top, bottom, spans }
  boundaries.set(ring, result)
  return result
}

function spanAt(boundary: Boundary, y: number): readonly [number, number] {
  const index = clamp(
    ((y - boundary.top) / (boundary.bottom - boundary.top)) * 160 - 0.5,
    0,
    159
  )
  const lower = Math.floor(index)
  const fraction = index - lower
  const first = boundary.spans[lower]
  const second = boundary.spans[Math.min(lower + 1, 159)]
  return [
    first[0] + (second[0] - first[0]) * fraction,
    first[1] + (second[1] - first[1]) * fraction,
  ]
}

// Rich characters use pose/home 17/-14/29 for an identity eye projection.
// The static logo instead compares that pose to 33/-19/38 and sits lower.
export function paintEyes(
  pair: EyePair,
  shape: CharacterShape,
  state: CharacterState,
  {
    gazeX = 0,
    gazeY = 0,
    time = 0,
    lid = 1,
    size = 1,
    winkIndex = -1,
    winkProgress = -1,
    spin = null,
  }: {
    gazeX?: number
    gazeY?: number
    time?: number
    lid?: number
    size?: number
    winkIndex?: number
    winkProgress?: number
    spin?: number | null
  } = {}
) {
  const geometry = CHARACTER_GEOMETRY[shape]
  const face = geometry.face
  const idle = state === "idle" || state === "working"
  const gap = idle ? 1 : 1.18
  const scale = 0.92 / (SHAPE_SCALES[shape] ?? 1)
  const centers = pair.map(centroid)
  const leftDX = "leftDX" in face ? face.leftDX : 0
  const spacing =
    Math.abs(centers[1][0] - centers[0][0] - leftDX) * face.sx * gap
  const halfWidths = pair.map((ring, eye) =>
    Math.max(...ring.map((point) => Math.abs(point[0] - centers[eye][0])))
  )
  const maxScale = clamp(spacing / (halfWidths[0] + halfWidths[1]), 0.35, 4)
  const baseSize = Math.min(clamp(size, 0.2, 2) * scale, maxScale)
  const scaleX = Math.min(baseSize * (idle ? 1.2 : 0.96), maxScale)
  const boundary = boundaryFor(geometry.ring)
  const { top, bottom } = boundary
  const rotations = centers.map(([cx, cy], eye) => {
    const baseY = clamp(
      HEAD_CENTER + face.y + (cy - HEAD_CENTER) * face.sy,
      top + 2,
      bottom - 2
    )
    const [left, right] = spanAt(boundary, baseY)
    const radius = Math.max((right - left) / 2, 12)
    const offset = (cx + (eye === 0 ? leftDX : 0) - HEAD_CENTER) * face.sx * gap
    const home = Math.asin(clamp(offset / radius, -1, 1))
    const angle = home + (spin ?? 0)
    const cosine = Math.cos(angle)
    return {
      x: (left + right) / 2 + radius * Math.sin(angle),
      visible: cosine > 0.02,
      width: Math.max(cosine, 0.02) / Math.max(Math.cos(home), 0.02),
      edge: clamp(cosine / 0.5, 0, 1),
    }
  })
  const collision = [0, 0]
  if (spin !== null && rotations.every((eye) => eye.visible)) {
    const remaining = rotations[1].x - rotations[0].x
    if (remaining < spacing) {
      collision[0] = -(spacing - remaining) / 2
      collision[1] = (spacing - remaining) / 2
    }
  }
  return pair.map((ring, eye) => {
    const [cx, cy] = centers[eye]
    let open = Math.max(lid, 0.04)
    if (eye === winkIndex && winkProgress >= 0 && winkProgress < 1) {
      open = Math.max(
        open *
          (winkProgress < 0.42
            ? 1 - winkProgress / 0.42
            : (winkProgress - 0.42) / 0.58),
        0.04
      )
    }
    const scaleY = clamp(baseSize * open * (idle ? 1.16 : 0.92), 0.02, 2.4)
    const width = clamp(
      scaleX * (spin === null ? 1 : rotations[eye].width),
      0.02,
      2.4
    )
    const driftX =
      1.4 * Math.sin(0.00042 * time + eye) +
      0.5 * Math.sin(0.001 * time + 2 * eye)
    const driftY = 0.9 * Math.sin(0.00058 * time + eye)
    const padding = 21 * scaleY + 2
    const y = clamp(
      HEAD_CENTER + face.y + (cy + gazeY + driftY - HEAD_CENTER) * face.sy,
      top + padding,
      bottom - padding
    )
    let minX = -Infinity
    let maxX = Infinity
    for (let index = 0; index < ring.length; index += 2) {
      const point = ring[index]
      const localX = (point[0] - cx) * width
      const [left, right] = spanAt(boundary, y + (point[1] - cy) * scaleY)
      minX = Math.max(minX, left - localX)
      maxX = Math.min(maxX, right - localX)
    }
    const intendedX =
      spin === null
        ? HEAD_CENTER +
          face.x +
          ((cx + (eye === 0 ? leftDX : 0) - HEAD_CENTER) * gap +
            gazeX +
            driftX) *
            face.sx
        : rotations[eye].x + collision[eye] + (gazeX + driftX) * face.sx
    const boundedX =
      minX <= maxX ? clamp(intendedX, minX, maxX) : (minX + maxX) / 2
    const edge = rotations[eye].edge
    const visibility = edge * edge * (3 - 2 * edge)
    const x =
      spin === null
        ? boundedX
        : boundedX + (intendedX - boundedX) * (1 - visibility)
    const points = ring.map(
      (point) =>
        `${(x + (point[0] - cx) * width).toFixed(2)} ${(y + (point[1] - cy) * scaleY).toFixed(2)}`
    )
    return {
      path: `M${points.join("L")}Z`,
      cx: x,
      cy: y,
      opacity: spin === null || rotations[eye].visible ? 1 : 0,
    }
  })
}
