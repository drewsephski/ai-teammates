import { NextResponse, type NextRequest } from "next/server"

import { androidApkUrl, appDownloadPath } from "@/lib/app-download"
import { publicOrigin } from "@/lib/api-response"

// A stable link to the current Android build, used by the download page and
// its QR codes. Redirecting rather than streaming keeps the large APK off the
// Railway service.
export function GET(request: NextRequest) {
  const apk = androidApkUrl(process.env.ANDROID_APK_URL)
  const location =
    apk ?? new URL(appDownloadPath, publicOrigin(request.headers)).href
  const response = NextResponse.redirect(location, 302)
  // Never cache the redirect, so a new build takes over at once.
  response.headers.set("Cache-Control", "no-store")
  return response
}
