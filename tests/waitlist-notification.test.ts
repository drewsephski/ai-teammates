import assert from "node:assert/strict"
import { it } from "node:test"
import { emailWaitlistSignup } from "../lib/waitlist-notification"

it("emails the owner the subscriber and devices, using stable private idempotency keys", async () => {
  const requests: RequestInit[] = []
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails")
    requests.push(init!)
    return Response.json({ id: "email-id" })
  }
  const options = {
    apiKey: "test-key",
    from: "Krafty <hello@example.com>",
    fetch: fakeFetch,
  }
  await emailWaitlistSignup(
    [
      { email: "person@example.com", platform: "mac" },
      { email: "person@example.com", platform: "iphone" },
    ],
    options
  )
  await emailWaitlistSignup(
    [
      { email: "person@example.com", platform: "iphone" },
      { email: "person@example.com", platform: "mac" },
    ],
    options
  )
  assert.deepEqual(requests[0].headers, requests[1].headers)
  const headers = new Headers(requests[0].headers)
  assert.equal(headers.get("Authorization"), "Bearer test-key")
  assert.equal(headers.get("Idempotency-Key")?.includes("person@"), false)
  const body = JSON.parse(requests[0].body as string)
  assert.deepEqual(body.to, ["drewsepeczi@gmail.com"])
  assert.equal(body.from, options.from)
  assert.match(body.text, /person@example.com/)
  assert.match(body.text, /iPhone \+ Mac/)
})

it("skips duplicates without contacting the email provider", async () => {
  await emailWaitlistSignup([], {
    fetch: async () => {
      throw new Error("must not call")
    },
  })
})

it("reports provider failures without leaking the provider response", async () => {
  await assert.rejects(
    emailWaitlistSignup([{ email: "person@example.com", platform: "mac" }], {
      apiKey: "test-key",
      from: "hello@example.com",
      fetch: async () =>
        new Response("sensitive provider details", { status: 429 }),
    }),
    { message: "Waitlist notification failed (HTTP 429)" }
  )
})

it("does not silently accept missing configuration", async () => {
  await assert.rejects(
    emailWaitlistSignup([{ email: "person@example.com", platform: "mac" }], {
      apiKey: "",
      from: "",
    }),
    /require RESEND_API_KEY and RESEND_FROM_EMAIL/
  )
})
