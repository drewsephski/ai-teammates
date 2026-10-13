import assert from "node:assert/strict"
import test from "node:test"
import { CHARACTER_GEOMETRY } from "./character-geometry"
import { createCharacterReactions } from "./character-reactions"
import {
  EXPRESSION_POOLS,
  expressionPair,
  paintEyes,
  interpolateEyes,
} from "./character-eyes"
import {
  CIRCLE_PATH,
  gazeEase,
  gazeTarget,
  morphPath,
  pulse,
  seededRandom,
  spring,
  stepSpring,
  sequenceState,
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

test("hero plays waking once and footer follows its original phase durations", () => {
  assert.equal(sequenceState("hero", 0).state, "waking")
  assert.equal(sequenceState("hero", 2200).state, "idle")
  assert.equal(sequenceState("hero", 23200).state, "idle")
  assert.equal(sequenceState("footer", 7000).state, "curious")
  assert.equal(sequenceState("footer", 17400).state, "bored")
  assert.equal(sequenceState("footer", 43800).state, "idle")
})

test("rich idle eyes retain the original upper-right face placement", () => {
  const pair = expressionPair("idle", 0)
  const eyes = paintEyes(pair, "blob", "idle")
  assert.ok(eyes[0].cy < 70)
  assert.ok(eyes[1].cy < 65)
  assert.ok(eyes[0].cx > 125)
  assert.ok(eyes[1].cx > 175)
  assert.deepEqual(
    interpolateEyes(pair, expressionPair("idle", 8), 1),
    expressionPair("idle", 8)
  )
})

test("each page expression projects finite eyes for every source silhouette", () => {
  for (const shape of Object.keys(CHARACTER_GEOMETRY) as Array<
    keyof typeof CHARACTER_GEOMETRY
  >) {
    for (const state of Object.keys(EXPRESSION_POOLS) as Array<
      keyof typeof EXPRESSION_POOLS
    >) {
      const eyes = paintEyes(
        expressionPair(state, EXPRESSION_POOLS[state][0]),
        shape,
        state,
        { gazeX: 13.2, gazeY: -8.4, time: 1250, lid: 0.1 }
      )
      for (const eye of eyes)
        assert.ok(!eye.path.includes("NaN") && !eye.path.includes("Infinity"))
    }
  }
})

test("source spin-bounce completes its 700ms turn before the 48-unit bounce", () => {
  const react = createCharacterReactions(() => 0.7)
  react("happy", 0, 0)
  assert.ok(react("happy", 4250, 0).spin === 0)
  const halfway = react("happy", 4600, 0)
  assert.ok(Math.abs((halfway.spin ?? 0) + Math.PI) < 1e-10)
  react("happy", 4950, 0)
  assert.equal(react("happy", 5200, 0).y, -48)
  assert.equal(react("happy", 6400, 0).y, 0)
})

test("3D turns hide eyes on the back of the head and restore them on the front", () => {
  const eyes = expressionPair("idle", 0)
  assert.ok(
    paintEyes(eyes, "blob", "idle", { spin: Math.PI }).every(
      (eye) => eye.opacity === 0
    )
  )
  assert.ok(
    paintEyes(eyes, "blob", "idle", { spin: Math.PI * 2 }).every(
      (eye) => eye.opacity === 1
    )
  )
})

test("playful dizzy spins use the authored accelerating four-turn motion", () => {
  const react = createCharacterReactions(() => 0.7)
  react("playful", 0, 0)
  react("playful", 4250, 0)
  const middle = react("playful", 4845, 0)
  assert.ok(Math.abs((middle.spin ?? 0) + Math.PI * 2) < 1e-10)
  const rest = react("playful", 5500, 0)
  assert.equal(rest.spin, null)
  assert.ok(rest.lid !== undefined && Number.isFinite(rest.rotation))
})
