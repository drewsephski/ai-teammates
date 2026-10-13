import assert from "node:assert/strict"
import test from "node:test"
import { CHARACTER_GEOMETRY } from "./character-geometry"
import {
  CIRCLE_PATH,
  gazeEase,
  gazeTarget,
  morphPath,
  pulse,
  seededRandom,
  spring,
  stepSpring,
} from "./character-motion"

test("cursor gaze stays subtle at distant screen coordinates and handles zero size", () => {
  const bounds = { left: 100, top: 100, width: 100, height: 100 }
  assert.deepEqual(gazeTarget({ x: 150, y: 150 }, bounds), { x: 0, y: 0 })
  const far = gazeTarget({ x: 10000, y: -10000 }, bounds)
  assert.ok(Math.abs(far.x - 13.2) < 1e-10)
  assert.ok(Math.abs(far.y + 8.4) < 1e-10)
  assert.deepEqual(gazeTarget({ x: 200, y: 300 }, { ...bounds, width: 0 }), {
    x: 0,
    y: 0,
  })
  assert.deepEqual(gazeTarget(null, bounds), { x: 0, y: 0 })
})

test("source gaze smoothing is independent of the display refresh rate", () => {
  function follow(rate: number) {
    let value = 0
    for (let frame = 0; frame < rate; frame++)
      value += (10 - value) * gazeEase(1 / rate)
    return value
  }
  assert.ok(Math.abs(follow(30) - follow(144)) < 1e-10)
})

test("source springs settle without becoming unstable when frames arrive slowly", () => {
  const value = spring()
  value.target = 8
  for (let frame = 0; frame < 100; frame++) stepSpring(value, 26, 1, 0.1)
  assert.ok(Number.isFinite(value.position))
  assert.ok(Math.abs(value.position - 8) < 1e-6)
})

test("every authored silhouette morphs to the same source circle without invalid paths", () => {
  for (const geometry of Object.values(CHARACTER_GEOMETRY)) {
    assert.equal(geometry.ring.length, 96)
    for (const amount of [0, 0.2, 0.5, 1]) {
      const path = morphPath(geometry.ring, amount)
      assert.ok(path.startsWith("M") && path.endsWith("Z"))
      assert.ok(!path.includes("NaN") && !path.includes("Infinity"))
    }
    assert.equal(morphPath(geometry.ring, 1), CIRCLE_PATH)
  }
})

test("dot pulses repeat on the source 1400ms cadence and seeds are reproducible", () => {
  const first = pulse(50, 1, 1)
  const next = pulse(1450, 1, 1)
  assert.ok(Math.abs(first.lift - next.lift) < 1e-10)
  assert.ok(first.tone >= 0.5 && first.tone <= 1)
  const a = seededRandom(42)
  const b = seededRandom(42)
  for (let index = 0; index < 20; index++) assert.equal(a(), b())
})
