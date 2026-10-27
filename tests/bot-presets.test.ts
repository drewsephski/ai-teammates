import assert from "node:assert/strict"
import { test } from "node:test"
import { botPresets } from "../lib/bot-presets"

test("advanced presets preserve bounded configuration and carry authentication and action guidance into the real bot", () => {
  for (const preset of botPresets) {
    assert.ok(preset.instructions.length <= 4000)
    assert.match(preset.instructions, /end-to-end work/)
    assert.match(preset.instructions, /connected-app APIs/)
    assert.match(preset.instructions, /sign in themselves in the live Desktop/)
    assert.match(
      preset.instructions,
      /A connection grants access, not permission/
    )
    assert.match(preset.prompt, /connect|sign in/)
    assert.ok(preset.suggestedApps.length > 0)
  }
})

test("client-work presets prepare messages for approval and never invent terms", () => {
  for (const id of ["follow-up", "scope"]) {
    const preset = botPresets.find((preset) => preset.id === id)
    assert.ok(preset, id)
    assert.match(preset.instructions, /approval/)
    assert.match(preset.instructions, /Never invent/)
    assert.match(preset.instructions, /scheduleRoutine/)
    assert.ok(preset.suggestedApps.some((app) => app === "Gmail"))
  }
})
