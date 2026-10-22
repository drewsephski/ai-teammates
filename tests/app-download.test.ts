import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  androidApkUrl,
  detectMobilePlatform,
  githubReleaseRepo,
  releaseBuildNumber,
} from "../lib/app-download"

describe("detectMobilePlatform", () => {
  it("recognises Android phones", () => {
    assert.equal(
      detectMobilePlatform(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36"
      ),
      "android"
    )
  })

  it("recognises iPhones", () => {
    assert.equal(
      detectMobilePlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
      ),
      "ios"
    )
  })

  it("treats desktops and missing headers as desktop", () => {
    assert.equal(
      detectMobilePlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
      ),
      null
    )
    assert.equal(detectMobilePlatform(""), null)
    assert.equal(detectMobilePlatform(null), null)
  })
})

describe("androidApkUrl", () => {
  it("accepts an https URL", () => {
    assert.equal(
      androidApkUrl(" https://example.com/Krafty.apk "),
      "https://example.com/Krafty.apk"
    )
  })

  it("rejects missing, malformed and plain http URLs", () => {
    assert.equal(androidApkUrl(undefined), null)
    assert.equal(androidApkUrl(""), null)
    assert.equal(androidApkUrl("not a url"), null)
    assert.equal(androidApkUrl("http://example.com/Krafty.apk"), null)
  })
})

describe("githubReleaseRepo", () => {
  it("finds the repository behind a GitHub release link", () => {
    assert.equal(
      githubReleaseRepo(
        "https://github.com/drewsephski/krafty-releases/releases/latest/download/Krafty.apk"
      ),
      "drewsephski/krafty-releases"
    )
  })

  it("ignores other hosts and missing links", () => {
    assert.equal(
      githubReleaseRepo("https://expo.dev/artifacts/eas/abc.apk"),
      null
    )
    assert.equal(githubReleaseRepo(null), null)
  })
})

describe("releaseBuildNumber", () => {
  it("reads the build from the tag or the title", () => {
    assert.equal(releaseBuildNumber({ tag_name: "android-1.0.0-build10" }), 10)
    assert.equal(
      releaseBuildNumber({
        tag_name: "android-1.0.0",
        name: "Krafty for Android 1.0.0 (build 6)",
      }),
      6
    )
  })

  it("is null when neither names a build", () => {
    assert.equal(releaseBuildNumber({ tag_name: "v1.0.0", name: 3 }), null)
  })
})
