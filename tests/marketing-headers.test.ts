import assert from "node:assert/strict"
import { it } from "node:test"

import config from "@/next.config"

it("keeps same-origin dictation available while restricting unused device APIs", async () => {
  const rules = await config.headers!()
  const policy = rules
    .find((rule) => rule.source === "/:path*")
    ?.headers.find((header) => header.key === "Permissions-Policy")?.value

  assert.ok(policy)
  assert.match(policy, /(?:^|,\s*)microphone=\(self\)(?:,|$)/)
  assert.match(policy, /(?:^|,\s*)camera=\(\)(?:,|$)/)
  assert.match(policy, /(?:^|,\s*)geolocation=\(\)(?:,|$)/)
})

it("limits immutable brand caching to the versioned image assets", async () => {
  const rules = await config.headers!()
  const immutable = rules.filter((rule) =>
    rule.headers.some(
      (header) =>
        header.key === "Cache-Control" && header.value.includes("immutable")
    )
  )

  assert.equal(immutable.length, 1)
  assert.equal(
    immutable[0].source,
    "/brand/:asset(krafty-social-v1.jpg|krafty-icon-v1.png)"
  )
})
