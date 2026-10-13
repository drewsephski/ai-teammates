import { HEAD_CENTER, clamp, smoothStep } from "./character-motion"

const NS = "http://www.w3.org/2000/svg"
type Point = { x: number; y: number; angle: number; z: number }
type Orbit = {
  angle: number
  angleVelocity: number
  carry: number
  follow: number
  tilt: number
  roll: number
  radius: number
  radiusVelocity: number
  width: number
  arc: number
  hue: number
  hueSpan: number
  hueVelocity: number
  life: number
  retreat: number
  history: Point[]
  back: SVGPathElement
  front: SVGPathElement
  gradient: SVGLinearGradientElement
  stops: SVGStopElement[]
}
function position(orbit: Orbit, angle: number): Point {
  const x = orbit.radius * Math.sin(angle)
  const y = -orbit.radius * Math.cos(angle) * Math.sin(orbit.tilt)
  return {
    x: HEAD_CENTER + x * Math.cos(orbit.roll) - y * Math.sin(orbit.roll),
    y: HEAD_CENTER + x * Math.sin(orbit.roll) + y * Math.cos(orbit.roll),
    angle,
    z: Math.cos(angle) * Math.cos(orbit.tilt),
  }
}

function ribbon(points: readonly Point[], width: number) {
  let length = 0
  for (let index = 1; index < points.length; index++)
    length += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].y - points[index - 1].y
    )
  if (length < 2) return { front: "", back: "" }
  const offsets = points.map((point, index) => {
    const previous = points[Math.max(index - 1, 0)],
      next = points[Math.min(index + 1, points.length - 1)]
    const x = next.x - previous.x,
      y = next.y - previous.y
    const size = Math.hypot(x, y) || 1
    const half =
      (Math.min(width, 0.34 * length) *
        (0.5 + (index / (points.length - 1)) * 0.5)) /
      2
    return { x: (-y / size) * half, y: (x / size) * half }
  })
  const round = (number: number) => Math.round(number * 10) / 10
  const cap = (index: number) => {
    const radius = Math.max(Math.hypot(offsets[index].x, offsets[index].y), 0.2)
    return `A${round(radius)} ${round(radius)} 0 0 0 `
  }
  const segment = (start: number, end: number) => {
    let path = ""
    for (let index = start; index <= end; index++)
      path += `${index === start ? "M" : "L"}${round(points[index].x + offsets[index].x)} ${round(points[index].y + offsets[index].y)}`
    path += end === points.length - 1 ? cap(end) : "L"
    for (let index = end; index >= start; index--)
      path += `${index === end ? "" : "L"}${round(points[index].x - offsets[index].x)} ${round(points[index].y - offsets[index].y)}`
    if (start === 0)
      path += `${cap(0)}${round(points[0].x + offsets[0].x)} ${round(points[0].y + offsets[0].y)}`
    return path + "Z"
  }
  let front = "",
    back = "",
    cursor = 0
  while (cursor < points.length) {
    const visible = points[cursor].z >= 0
    let end = cursor
    while (end + 1 < points.length && points[end + 1].z >= 0 === visible) end++
    const start = Math.max(cursor - 1, 0),
      last = Math.min(end + 1, points.length - 1)
    if (last > start) {
      const path = segment(start, last)
      if (visible) front += path
      else back += path
    }
    cursor = end + 1
  }
  return { front, back }
}

// Source orbit ribbons follow actual angular speed and split around the head.
export function createCharacterTrails(
  back: SVGGElement,
  front: SVGGElement,
  id: string,
  random: () => number
) {
  const range = (min: number, max: number) => min + random() * (max - min)
  let previousAngle = 0,
    previousVelocity = 0,
    orbitIndex = 0
  let queue: Array<{ at: number; index: number }> = []
  let count = 4,
    tilt = 0,
    roll = 0,
    hue = 0,
    emitted = false
  let orbits: Orbit[] = []
  const remove = (orbit: Orbit) => {
    orbit.back.remove()
    orbit.front.remove()
    orbit.gradient.remove()
  }
  return {
    update(time: number, dt: number, angle: number, size: number) {
      let delta = angle - previousAngle
      if (!Number.isFinite(delta) || Math.abs(delta) > 1.2) delta = 0
      previousAngle = angle
      const velocity = dt > 0 ? delta / dt : 0
      const moving = Math.abs(velocity) >= 0.9
      if (Math.abs(previousVelocity) < 0.9 && moving) {
        const baseRoll = range(-0.85, 0.85)
        tilt = range(0.16, 0.5)
        roll = baseRoll + range(-0.12, 0.12)
        count = Math.round(range(3, 5))
        hue = range(0, 360)
        emitted = false
      }
      if (Math.abs(previousVelocity) >= 0.9 && !moving) queue = []
      previousVelocity = velocity
      if (!emitted && Math.abs(velocity) >= 5) {
        emitted = true
        queue = Array.from({ length: count }, (_, index) => ({
          at: time + index * range(55, 105),
          index,
        }))
      }
      while (queue.length && time >= queue[0].at) {
        const entry = queue.shift()!
        const gradient = document.createElementNS(NS, "linearGradient")
        const gradientId = `${id}-trail-${orbitIndex++}`
        gradient.setAttribute("id", gradientId)
        gradient.setAttribute("gradientUnits", "userSpaceOnUse")
        const stops = Array.from({ length: 5 }, (_, index) => {
          const stop = document.createElementNS(NS, "stop")
          stop.setAttribute("offset", (index / 4).toFixed(3))
          gradient.appendChild(stop)
          return stop
        })
        const rear = document.createElementNS(NS, "path"),
          fore = document.createElementNS(NS, "path")
        for (const path of [rear, fore]) {
          path.setAttribute("fill", `url(#${gradientId})`)
          path.setAttribute("data-trail", "")
        }
        back.append(gradient, rear)
        front.append(fore)
        orbits.push({
          angle: angle - range(0, 0.18),
          angleVelocity: (Math.sign(velocity) || 1) * range(0.5, 1.1),
          carry: 0,
          follow: range(0.74, 0.94),
          tilt: tilt + range(-0.04, 0.04),
          roll: roll + range(-0.05, 0.05),
          radius: 116 + range(-1.5, 1.5),
          radiusVelocity: range(0, 2.5),
          width:
            count <= 3
              ? range(8, 10.5)
              : count === 4
                ? range(6.6, 8.6)
                : range(5.6, 7.4),
          arc: range(2.2, 3.4),
          hue: hue + (360 * entry.index) / count + range(-14, 14),
          hueSpan: range(45, 95) * (random() < 0.5 ? 1 : -1),
          hueVelocity: range(18, 42) * (random() < 0.5 ? 1 : -1),
          life: 0,
          retreat: 0,
          history: [],
          back: rear,
          front: fore,
          gradient,
          stops,
        })
      }
      orbits = orbits.filter((orbit) => {
        orbit.life += dt
        orbit.retreat = clamp(
          orbit.retreat +
            (!moving || orbit.life / 9 > 0.55 ? dt / 0.5 : -dt / 0.35),
          0,
          1
        )
        if (orbit.retreat >= 1) {
          remove(orbit)
          return false
        }
        if (moving) {
          orbit.carry = velocity * orbit.follow
          orbit.angle += velocity * dt * orbit.follow + orbit.angleVelocity * dt
        } else {
          orbit.angle += (orbit.carry + orbit.angleVelocity) * dt
          orbit.carry *= Math.exp(-2.6 * dt)
          orbit.angleVelocity *= Math.exp(-2.6 * dt)
        }
        orbit.radius += orbit.radiusVelocity * dt
        const point = position(orbit, orbit.angle)
        const lastAngle = orbit.history.length
          ? orbit.history[orbit.history.length - 1].angle
          : orbit.angle
        const difference = orbit.angle - lastAngle
        const samples = Math.min(Math.ceil(Math.abs(difference) / 0.09), 24)
        for (let index = 1; index <= samples; index++)
          orbit.history.push(
            position(orbit, lastAngle + (difference * index) / samples)
          )
        if (!orbit.history.length) orbit.history.push(point)
        const arc = orbit.arc * (1 - smoothStep(orbit.retreat))
        while (
          orbit.history.length > 2 &&
          Math.abs(orbit.angle - orbit.history[0].angle) > arc
        )
          orbit.history.shift()
        const excess = Math.abs(orbit.angle - orbit.history[0].angle) - arc
        if (orbit.history.length >= 2 && excess > 0)
          orbit.history[0] = position(
            orbit,
            orbit.history[0].angle +
              Math.sign(orbit.angle - orbit.history[0].angle) * excess
          )
        if (orbit.history.length > 48)
          orbit.history.splice(0, orbit.history.length - 48)
        const width = Math.max(
          orbit.width *
            (0.72 + 0.28 * clamp(point.z, 0, 1)) *
            1.7 *
            size *
            smoothStep(Math.min(orbit.life / 0.34, 1)) *
            (1 - 0.72 * orbit.retreat ** 2),
          0.5
        )
        const paths = ribbon(orbit.history, width)
        orbit.back.setAttribute("d", paths.back)
        orbit.front.setAttribute("d", paths.front)
        const opacity = Math.min(1, orbit.life / 0.26).toFixed(3)
        orbit.back.setAttribute("opacity", opacity)
        orbit.front.setAttribute("opacity", opacity)
        orbit.stops.forEach((stop, index) => {
          const fraction = index / 4
          const color =
            orbit.hue +
            orbit.hueVelocity * orbit.life +
            fraction * orbit.hueSpan
          stop.setAttribute(
            "stop-color",
            `hsl(${(((color % 360) + 360) % 360).toFixed(0)} 56% ${(56 + 11 * fraction).toFixed(0)}%)`
          )
        })
        const first = orbit.history[0],
          last = orbit.history[orbit.history.length - 1]
        orbit.gradient.setAttribute("x1", first.x.toFixed(1))
        orbit.gradient.setAttribute("y1", first.y.toFixed(1))
        orbit.gradient.setAttribute("x2", last.x.toFixed(1))
        orbit.gradient.setAttribute("y2", last.y.toFixed(1))
        return true
      })
    },
    clear() {
      for (const orbit of orbits) remove(orbit)
      orbits = []
      queue = []
      previousAngle = 0
      previousVelocity = 0
    },
  }
}
