import { apiRoute } from "@/lib/api"
import { publicOrigin } from "@/lib/api-response"
import { androidDownloadPath } from "@/lib/app-download"
import { latestAndroidBuild } from "@/lib/app-release"

// The newest Android build and where to get it, for the app's update prompt
// (krafty-mobile builds from 11). Null when it can't be determined.
export const GET = apiRoute(async (_caller, request) => {
  const build = await latestAndroidBuild()
  return {
    android: build
      ? {
          build,
          url: new URL(androidDownloadPath, publicOrigin(request.headers)).href,
        }
      : null,
  }
})
