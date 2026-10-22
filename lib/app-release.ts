import {
  androidApkUrl,
  githubReleaseRepo,
  releaseBuildNumber,
} from "@/lib/app-download"

// The newest published Android build, from the latest GitHub release of the
// repository ANDROID_APK_URL points at. Publishing a release is the whole
// release step: installed builds compare their own number with this one.
const CACHE_MS = 10 * 60_000
let cached: { at: number; build: number | null } | undefined

export async function latestAndroidBuild(
  fetchImpl: typeof fetch = fetch,
  now = Date.now()
): Promise<number | null> {
  if (cached && now - cached.at < CACHE_MS) return cached.build
  const repo = githubReleaseRepo(androidApkUrl(process.env.ANDROID_APK_URL))
  if (!repo) return null
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "kraftybot.app",
        },
        signal: AbortSignal.timeout(5_000),
      }
    )
    if (!response.ok) throw new Error(`GitHub ${response.status}`)
    const build = releaseBuildNumber(await response.json())
    cached = { at: now, build }
    return build
  } catch {
    // An update prompt is optional: keep the last answer, or show none
    return cached?.build ?? null
  }
}

export function resetLatestAndroidBuildCache() {
  cached = undefined
}
