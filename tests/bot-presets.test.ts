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
