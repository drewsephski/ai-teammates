"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { AnimatedArrow } from "@/components/ui/animated-arrow"
import styles from "./footer.module.css"

const INK = 37
const WARM = 115
const GAP = 5
const POINTER_RADIUS = 80
const STRIDE = 7 // x, y, vx, vy, home x, home y, radius

/** The supplied halftone treatment, tuned to Krafty's neutral palette. */
export function HalftoneWordmarkFooter({ children }: { children: ReactNode }) {
  const wordRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const root = wordRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!root || !canvas || !ctx) return

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let reduced = motion.matches
    let width = 0
    let height = 0
    let dpr = 1
    let dots = new Float32Array(0)
    let grain: CanvasPattern | null = null
    let pointerX = -100_000
    let pointerY = -100_000
    let frame = 0
    let previousFrame = 0
    let visible = false
    let alive = true
    let ring = { x: 0, y: 0, started: -100_000 }

    const tile = document.createElement("canvas")
    tile.width = tile.height = 128
    const tileContext = tile.getContext("2d")
    if (tileContext) {
      const pixels = tileContext.createImageData(128, 128)
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = Math.random() * 255
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value
        pixels.data[i + 3] = 255
      }
      tileContext.putImageData(pixels, 0, 0)
      grain = ctx.createPattern(tile, "repeat")
    }

    function layout() {
      if (!root || !canvas) return
      const bounds = root.getBoundingClientRect()
      width = Math.max(1, Math.round(bounds.width))
      height = Math.max(1, Math.round(bounds.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)

      const mask = document.createElement("canvas")
      mask.width = width
      mask.height = height
      const maskContext = mask.getContext("2d", { willReadFrequently: true })
      if (!maskContext) return
      const face = getComputedStyle(root).fontFamily
      maskContext.font = `800 100px ${face}`
      const size =
        ((width * 1.02) / maskContext.measureText("krafty").width) * 100
      maskContext.font = `800 ${size}px ${face}`
      const metrics = maskContext.measureText("krafty")
      const cap = metrics.actualBoundingBoxAscent || size * 0.72
      maskContext.fillText(
        "krafty",
        (width - metrics.width) / 2,
        height + cap * 0.18
      )
      const pixels = maskContext.getImageData(0, 0, width, height).data
      const cells: number[] = []
      for (let y = 0; y < height; y += GAP) {
        for (let x = 0; x < width; x += GAP) {
          let coverage = 0
          for (let sy = 0; sy < 3; sy++) {
            for (let sx = 0; sx < 3; sx++) {
              const sampleX = Math.min(
                width - 1,
                Math.floor(x + ((sx + 0.5) * GAP) / 3)
              )
              const sampleY = Math.min(
                height - 1,
                Math.floor(y + ((sy + 0.5) * GAP) / 3)
              )
              coverage += pixels[(sampleY * width + sampleX) * 4 + 3]
            }
          }
          coverage /= 9 * 255
          if (coverage < 0.06) continue
          const homeX = x + GAP / 2
          const homeY = y + GAP / 2
          cells.push(
            homeX,
            homeY,
            0,
            0,
            homeX,
            homeY,
            Math.sqrt(coverage) * GAP * 0.56
          )
        }
      }
      dots = new Float32Array(cells)
    }

    function draw(now: number) {
      if (!ctx || !canvas) return false
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = "#f8f8f8"
      ctx.fillRect(0, 0, width, height)
      const ringAge = now - ring.started
      let moving = false

      for (let i = 0; i < dots.length; i += STRIDE) {
        const homeX = dots[i + 4]
        const homeY = dots[i + 5]
        let x = dots[i]
        let y = dots[i + 1]
        let vx = dots[i + 2]
        let vy = dots[i + 3]

        if (!reduced) {
          const dx = x - pointerX
          const dy = y - pointerY
          const distance = Math.hypot(dx, dy)
          if (distance < POINTER_RADIUS) {
            const force = (1 - distance / POINTER_RADIUS) * 2.6
            vx += (dx / (distance + 0.001)) * force
            vy += (dy / (distance + 0.001)) * force
          }
          if (ringAge < 900) {
            const dx = homeX - ring.x
            const dy = homeY - ring.y
            const distance = Math.hypot(dx, dy) + 0.001
            const band =
              1 - Math.min(1, Math.abs(distance - ringAge * 0.9) / 26)
            const force = band * 3.2 * (1 - ringAge / 900)
            vx += (dx / distance) * force
            vy += (dy / distance) * force
          }
          vx = (vx + (homeX - x) * 0.05) * 0.84
          vy = (vy + (homeY - y) * 0.05) * 0.84
          x += vx
          y += vy
          if (
            Math.abs(vx) + Math.abs(vy) > 0.02 ||
            Math.abs(x - homeX) + Math.abs(y - homeY) > 0.05
          ) {
            moving = true
          } else {
            x = homeX
            y = homeY
            vx = vy = 0
          }
        } else {
          x = homeX
          y = homeY
          vx = vy = 0
        }
        dots[i] = x
        dots[i + 1] = y
        dots[i + 2] = vx
        dots[i + 3] = vy
        const warmth = Math.min(1, Math.hypot(x - homeX, y - homeY) / 28)
        const channel = Math.round(INK + (WARM - INK) * warmth)
        ctx.fillStyle =
          warmth > 0.02 ? `rgb(${channel},${channel},${channel})` : "#252525"
        ctx.beginPath()
        ctx.arc(x, y, dots[i + 6], 0, Math.PI * 2)
        ctx.fill()
      }
      if (grain) {
        ctx.globalAlpha = 0.025
        ctx.globalCompositeOperation = "multiply"
        ctx.fillStyle = grain
        ctx.fillRect(0, 0, width, height)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = "source-over"
      }
      canvas.dataset.ready = "true"
      return !reduced && (moving || ringAge < 900 || pointerX > -10_000)
    }

    function loop(now: number) {
      frame = 0
      if (!visible || document.hidden) return
      // Keep spring speed consistent on high-refresh displays.
      if (now - previousFrame < 1000 / 60) {
        frame = requestAnimationFrame(loop)
        return
      }
      previousFrame = now - ((now - previousFrame) % (1000 / 60))
      if (draw(now)) frame = requestAnimationFrame(loop)
    }

    function wake() {
      if (alive && visible && !document.hidden && !frame) {
        frame = requestAnimationFrame(loop)
      }
    }

    function resetPointer() {
      pointerX = pointerY = -100_000
    }

    function onMove(event: PointerEvent) {
      if (reduced || event.pointerType === "touch" || !root) return
      const bounds = root.getBoundingClientRect()
      pointerX = event.clientX - bounds.left
      pointerY = event.clientY - bounds.top
      wake()
    }

    function onLeave() {
      resetPointer()
      wake()
    }

    function onDown(event: PointerEvent) {
      if (reduced || !root) return
      const bounds = root.getBoundingClientRect()
      ring = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        started: performance.now(),
      }
      wake()
    }

    function onMotionChange(event: MediaQueryListEvent) {
      reduced = event.matches
      resetPointer()
      ring.started = -100_000
      wake()
    }

    function onVisibilityChange() {
      resetPointer()
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else wake()
    }

    const resize = new ResizeObserver(() => {
      layout()
      draw(performance.now())
      wake()
    })
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
      else {
        cancelAnimationFrame(frame)
        frame = 0
        resetPointer()
      }
    })

    layout()
    draw(performance.now())
    resize.observe(root)
    intersection.observe(root)
    root.addEventListener("pointermove", onMove)
    root.addEventListener("pointerleave", onLeave)
    root.addEventListener("pointerdown", onDown)
    motion.addEventListener("change", onMotionChange)
    document.addEventListener("visibilitychange", onVisibilityChange)
    void document.fonts.ready.then(() => {
      if (!alive) return
      layout()
      draw(performance.now())
      wake()
    })

    return () => {
      alive = false
      cancelAnimationFrame(frame)
      resize.disconnect()
      intersection.disconnect()
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerleave", onLeave)
      root.removeEventListener("pointerdown", onDown)
      motion.removeEventListener("change", onMotionChange)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        {children}
        <div className={styles.rule}>
          <span>Built for people with things to make.</span>
          <button
            type="button"
            onClick={() => {
              const reduced = window.matchMedia(
                "(prefers-reduced-motion: reduce)"
              ).matches
              document.getElementById("top")?.focus({ preventScroll: true })
              window.scrollTo({
                top: 0,
                behavior: reduced ? "instant" : "smooth",
              })
            }}
          >
            Back to top <AnimatedArrow direction="up" size={14} />
          </button>
        </div>
      </div>
      <div ref={wordRef} className={styles.wordmark} aria-hidden="true">
        <canvas ref={canvasRef} />
        <span className={styles.fallback}>krafty</span>
      </div>
    </footer>
  )
}
