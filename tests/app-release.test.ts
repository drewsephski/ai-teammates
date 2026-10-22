import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"

import {
  latestAndroidBuild,
  resetLatestAndroidBuildCache,
} from "../lib/app-release"

const apk =
  "https://github.com/drewsephski/krafty-releases/releases/latest/download/Krafty.apk"

beforeEach(() => {
  process.env.ANDROID_APK_URL = apk
  resetLatestAndroidBuildCache()
})

test("reads the latest build from the release repository and caches it", async () => {
  const calls: string[] = []
  const fetchImpl = (async (url: string) => {
    calls.push(String(url))
    return Response.json({ tag_name: "android-1.0.0-build11" })
  }) as typeof fetch
  assert.equal(await latestAndroidBuild(fetchImpl, 0), 11)
  assert.equal(await latestAndroidBuild(fetchImpl, 60_000), 11)
  assert.deepEqual(calls, [
    "https://api.github.com/repos/drewsephski/krafty-releases/releases/latest",
  ])
  await latestAndroidBuild(fetchImpl, 11 * 60_000)
  assert.equal(calls.length, 2)
})

test("a failed lookup keeps the last answer, or reports none", async () => {
  const failing = (async () =>
    new Response("rate limited", { status: 403 })) as typeof fetch
  assert.equal(await latestAndroidBuild(failing, 0), null)

  const ok = (async () =>
    Response.json({ tag_name: "android-1.0.0-build10" })) as typeof fetch
  assert.equal(await latestAndroidBuild(ok, 0), 10)
  assert.equal(await latestAndroidBuild(failing, 11 * 60_000), 10)
})

test("an APK hosted elsewhere has no update check", async () => {
  process.env.ANDROID_APK_URL = "https://expo.dev/artifacts/eas/abc.apk"
  const fetchImpl = (async () => {
    throw new Error("should not be called")
  }) as typeof fetch
  assert.equal(await latestAndroidBuild(fetchImpl, 0), null)
})
