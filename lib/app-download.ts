// Where the mobile app comes from. The Android build is an APK hosted outside
// the repo (`ANDROID_APK_URL`); `/download/android` redirects to it, so links
// and QR codes stay valid when a new build replaces the file. iOS ships through
// the App Store once it is approved.

import { siteUrl } from "@/lib/marketing/site"

export type MobilePlatform = "android" | "ios"

/** The page a QR code or shared link opens on the phone. */
export const appDownloadPath = "/download"

/**
 * The production download page, so a QR code works from any checkout: a phone
 * can't reach a local dev server.
 */
export const appDownloadUrl = new URL(appDownloadPath, siteUrl).href

/** Stable link to the current Android APK. */
export const androidDownloadPath = "/download/android"

/**
 * The phone platform a browser is running on, or null on desktop. iPadOS
 * Safari reports itself as a Mac, so an iPad counts as desktop here; it gets
 * the same "coming soon" answer as an iPhone either way.
 */
export function detectMobilePlatform(
  userAgent: string | null | undefined
): MobilePlatform | null {
  if (!userAgent) return null
  if (/android/i.test(userAgent)) return "android"
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios"
  return null
}

/**
 * The APK URL to redirect to, or null when it is missing or not https. A plain
 * http link would let a network attacker swap the installer.
 */
export function androidApkUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}
