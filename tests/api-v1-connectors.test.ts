import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import test from "node:test"

import { apiErrorResponse, publicOrigin } from "../lib/api-response"
import {
  MOBILE_CONNECTOR_CALLBACK_PATH,
  mobileConnectInputSchema,
  mobileReturnLink,
  mobileReturnUrlSchema,
} from "../lib/mobile-connector"

test("native return URLs must use an allowlisted app scheme", () => {
  for (const url of [
    "krafty://apps/connected",
    "krafty:///apps",
    "exp://192.168.1.5:8081/--/apps/connected",
  ])
    assert.equal(mobileReturnUrlSchema.safeParse(url).success, true, url)
  for (const url of [
    "https://evil.example/apps",
    "http://localhost:3000/workspace",
    "javascript:alert(1)",
    "//evil.example",
    "kraftyx://apps",
    "krafty://user:pass@apps",
    "not a url",
    `krafty://apps/${"a".repeat(500)}`,
  ])
    assert.equal(mobileReturnUrlSchema.safeParse(url).success, false, url)
})

test("connect requests need a slug and a return URL, and bad ones are 400s", () => {
  const ok = mobileConnectInputSchema.safeParse({
    slug: "gmail",
    returnUrl: "krafty://apps/connected",
  })
  assert.equal(ok.success, true)
  const bad = mobileConnectInputSchema.safeParse({
    slug: "gmail",
    returnUrl: "https://evil.example",
  })
  assert.equal(bad.success, false)
  const response = apiErrorResponse(bad.error)
  assert.equal(response.status, 400)
  assert.equal(response.body.error.code, "invalid_request")
})

test("the bridge forwards only the provider's parameters to the stored app link", () => {
  const state = "7f1c2b9e-3a4d-4e5f-8a9b-0c1d2e3f4a5b"
  const link = new URL(
    mobileReturnLink(
      "krafty://apps/connected?tab=apps&status=forged",
      new URLSearchParams({
        connection_state: state,
        status: "success",
        connected_account_id: "ca_123",
        redirect: "https://evil.example",
      })
    )
  )
  assert.equal(link.protocol, "krafty:")
  assert.equal(link.host, "apps")
  assert.equal(link.pathname, "/connected")
  assert.deepEqual(Object.fromEntries(link.searchParams), {
    tab: "apps",
    status: "success",
    connection_state: state,
    connected_account_id: "ca_123",
  })

  const failed = new URL(
    mobileReturnLink(
      "krafty://apps/connected?connected_account_id=forged",
      new URLSearchParams({ connection_state: state, status: "weird" })
    )
  )
  assert.equal(failed.searchParams.get("status"), "failed")
  assert.equal(failed.searchParams.has("connected_account_id"), false)
})

test("the provider callback is an HTTPS page on the public origin", () => {
  assert.equal(
    existsSync(
      new URL(
        `../app${MOBILE_CONNECTOR_CALLBACK_PATH}/route.ts`,
        import.meta.url
      )
    ),
    true
  )
  const headers = new Headers({
    host: "kraftybot.app",
    "x-forwarded-proto": "https",
  })
  assert.equal(
    new URL(MOBILE_CONNECTOR_CALLBACK_PATH, publicOrigin(headers)).href,
    "https://kraftybot.app/api/v1/apps/connections/callback"
  )
  assert.equal(
    publicOrigin(new Headers({ host: "localhost:3000" })),
    "http://localhost:3000"
  )
  assert.throws(() => publicOrigin(new Headers()), /Missing Host header/)
})
