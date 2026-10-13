import { HEAD_CENTER } from "./character-motion"

const SVG_NS = "http://www.w3.org/2000/svg"
const COLORS = [
  "#f9705c",
  "#5b95f0",
  "#3fbe86",
  "#f5b13f",
  "#9a72ee",
  "#35c3bd",
]
const STAR = `M${Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + (index * Math.PI) / 5
  const radius = index % 2 === 0 ? 1 : 0.42
  return `${(Math.cos(angle) * radius).toFixed(3)} ${(Math.sin(angle) * radius).toFixed(3)}`
}).join("L")}Z`

type Particle = {
  element: SVGElement
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  radius: number
  rotation: number
  velocity: number
  star: boolean
  round: boolean
}

// Source waking bursts use physical particles, separate from the loading morph.
export function createCharacterBurst(
  group: SVGGElement,
  random: () => number,
  radius: number
) {
  const range = (min: number, max: number) => min + random() * (max - min)
  let particles: Particle[] = []
  return {
    burst(count: number, speedScale: number) {
      for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2 + range(-0.35, 0.35)
        const distance = (range(96, 116) * radius) / HEAD_CENTER
        const speed = range(170, 360) * speedScale
        const star = random() < 0.18
        const particleRadius = star ? range(4, 7) : range(3.5, 8)
        const rotation = range(0, 360)
        const velocity = range(-260, 260)
        const color = star
          ? "#f4c34e"
          : COLORS[Math.floor(random() * COLORS.length)]
        const round = !star && random() < 0.3
        const element = document.createElementNS(
          SVG_NS,
          star ? "path" : round ? "circle" : "rect"
        )
        if (star) element.setAttribute("d", STAR)
        element.setAttribute("fill", color)
        group.appendChild(element)
        particles.push({
          element,
          x: HEAD_CENTER + Math.cos(angle) * distance,
          y: HEAD_CENTER + Math.sin(angle) * distance,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - range(20, 75),
          life: 0,
          max: range(0.45, 0.85),
          radius: particleRadius,
          rotation,
          velocity,
          star,
          round,
        })
      }
    },
    update(dt: number) {
      particles = particles.filter((particle) => {
        particle.life += dt
        if (particle.life >= particle.max) {
          particle.element.remove()
          return false
        }
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        const drag = Math.pow(0.94, 60 * dt)
        particle.vx *= drag
        particle.vy = particle.vy * drag + 40 * dt
        const progress = particle.life / particle.max
        const opacity =
          progress < 0.1
            ? progress / 0.1
            : Math.pow(1 - (progress - 0.1) / 0.9, 1.7)
        const size = Math.max(particle.radius * (1 - 0.4 * progress), 0.5)
        const element = particle.element
        element.setAttribute("opacity", opacity.toFixed(3))
        if (particle.star) {
          particle.rotation += particle.velocity * dt
          element.setAttribute(
            "transform",
            `translate(${particle.x.toFixed(1)} ${particle.y.toFixed(1)}) rotate(${particle.rotation.toFixed(1)}) scale(${size.toFixed(2)})`
          )
        } else if (particle.round) {
          element.setAttribute("cx", particle.x.toFixed(1))
          element.setAttribute("cy", particle.y.toFixed(1))
          element.setAttribute("r", size.toFixed(2))
        } else {
          const width = Math.max(
            2 * size,
            Math.min(0.05 * Math.hypot(particle.vx, particle.vy), 30)
          )
          const height = 1.5 * size
          element.setAttribute("width", width.toFixed(1))
          element.setAttribute("height", height.toFixed(1))
          element.setAttribute("rx", (height / 2).toFixed(2))
          element.setAttribute("x", (particle.x - width / 2).toFixed(1))
          element.setAttribute("y", (particle.y - height / 2).toFixed(1))
          element.setAttribute(
            "transform",
            `rotate(${((180 * Math.atan2(particle.vy, particle.vx)) / Math.PI).toFixed(1)} ${particle.x.toFixed(1)} ${particle.y.toFixed(1)})`
          )
        }
        return true
      })
    },
    clear() {
      for (const particle of particles) particle.element.remove()
      particles = []
    },
  }
}
