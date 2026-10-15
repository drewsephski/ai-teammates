import { NextResponse } from "next/server"

import { apiRoute, readJson } from "@/lib/api"
import { publicOrigin } from "@/lib/api-response"
import { mobileConnectInputSchema } from "@/lib/mobile-connector"
import { beginMobileAppConnection } from "@/services/connectors"

// Starts connecting an app: { slug, returnUrl: "krafty://..." }. Open `url` in
// an auth session; the provider comes back through the HTTPS bridge, which
// forwards to `returnUrl`. A free plan's app limit comes back as data.
export const POST = apiRoute(async ({ userId }, request) => {
  const input = mobileConnectInputSchema.parse(await readJson(request))
  const started = await beginMobileAppConnection(
    userId,
    input,
    publicOrigin(request.headers)
  )
  if (!started.ok) return { ok: false, planLimit: "apps" }
  return NextResponse.json(started, { status: 201 })
})
