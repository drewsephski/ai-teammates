import { createHash } from "node:crypto"
import type { WaitlistPlatform } from "@/lib/app-waitlist"

type Signup = { email: string; platform: WaitlistPlatform }
type Options = {
  apiKey?: string
  from?: string
  fetch?: typeof fetch
}

// Sends only to the owner, never to an address from public form input.
// Call with INSERT ... RETURNING rows so duplicate signups send nothing.
export async function emailWaitlistSignup(
  signups: Signup[],
  options: Options = {}
) {
  if (signups.length === 0) return
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY
  const from = options.from ?? process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    throw new Error(
      "Waitlist notifications require RESEND_API_KEY and RESEND_FROM_EMAIL"
    )
  }
  const email = signups[0].email
  if (signups.some((signup) => signup.email !== email)) {
    throw new Error("Waitlist notification must contain one subscriber")
  }
  const platforms = [
    ...new Set(signups.map((signup) => signup.platform)),
  ].sort()
  const devices = platforms
    .map((platform) => (platform === "mac" ? "Mac" : "iPhone"))
    .join(" + ")
  const key = createHash("sha256")
    .update(JSON.stringify({ email, platforms }))
    .digest("hex")
  const response = await (options.fetch ?? fetch)(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `waitlist/${key}`,
      },
      body: JSON.stringify({
        from,
        to: ["drewsepeczi@gmail.com"],
        subject: `New Krafty waitlist signup · ${devices}`,
        text: `Someone joined the Krafty app waitlist.\n\nEmail: ${email}\nDevices: ${devices}\n\nSignup saved in the app_waitlist table.`,
      }),
      signal: AbortSignal.timeout(10_000),
    }
  )
  if (!response.ok) {
    // Do not include provider response bodies, email addresses, or credentials.
    throw new Error(`Waitlist notification failed (HTTP ${response.status})`)
  }
}
