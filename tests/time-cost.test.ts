import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampInput,
  exampleTasks,
  TIME_COST_LIMITS,
  timeCost,
} from "@/lib/time-cost"

describe("time cost calculator", () => {
  it("adds up minutes across tasks and prices the year", () => {
    const result = timeCost(
      [
        { name: "Email", minutes: 30, perWeek: 5 },
        { name: "Receipts", minutes: 20, perWeek: 1 },
      ],
      50
    )
    assert.equal(result.weeklyMinutes, 170)
    assert.equal(result.weeklyHours, 2.8)
    // 170 / 60 * 48 = 136 hours
    assert.equal(result.yearlyHours, 136)
    assert.equal(result.yearlyWorkdays, 17)
    assert.equal(result.yearlyCost, 6800)
    assert.equal(result.monthlyCost, 567)
  })

  it("returns zeros for no tasks or a zero rate", () => {
    assert.equal(timeCost([], 80).yearlyCost, 0)
    const free = timeCost(exampleTasks, 0)
    assert.ok(free.yearlyHours > 0)
    assert.equal(free.yearlyCost, 0)
  })

  it("ignores negative, blank and runaway inputs", () => {
    assert.equal(clampInput(Number.NaN, 10), 0)
    assert.equal(clampInput(-5, 10), 0)
    assert.equal(clampInput(Number.POSITIVE_INFINITY, 10), 0)
    assert.equal(clampInput(50, 10), 10)
    const result = timeCost([{ name: "Huge", minutes: 1e9, perWeek: 1e9 }], 1e9)
    const maxMinutes = TIME_COST_LIMITS.minutes * TIME_COST_LIMITS.perWeek
    assert.equal(result.weeklyMinutes, maxMinutes)
    assert.equal(
      result.yearlyCost,
      Math.round((maxMinutes / 60) * 48 * TIME_COST_LIMITS.hourlyRate)
    )
  })

  it("counts only the first tasks up to the limit", () => {
    const many = Array.from({ length: 20 }, () => ({
      name: "Task",
      minutes: 1,
      perWeek: 1,
    }))
    assert.equal(timeCost(many, 0).weeklyMinutes, TIME_COST_LIMITS.tasks)
  })
})
