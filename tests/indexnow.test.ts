import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { indexNowKey, indexNowPayload } from "@/lib/indexnow"

describe("IndexNow", () => {
  it("ships the key file that search engines verify", () => {
    assert.match(indexNowKey, /^[a-f0-9]{8,128}$/)
    const served = readFileSync(`public/${indexNowKey}.txt`, "utf8")
    assert.equal(served.trim(), indexNowKey)
  })

  it("builds a payload for the site's own host", () => {
    const payload = indexNowPayload("https://kraftybot.app", [
      "https://kraftybot.app/",
      "https://kraftybot.app/how-it-works",
      "https://kraftybot.app/",
    ])
    assert.deepEqual(payload, {
      host: "kraftybot.app",
      key: indexNowKey,
      keyLocation: `https://kraftybot.app/${indexNowKey}.txt`,
      urlList: ["https://kraftybot.app/", "https://kraftybot.app/how-it-works"],
    })
  })

  it("rejects URLs on another host and empty submissions", () => {
    assert.throws(
      () =>
        indexNowPayload("https://kraftybot.app", [
          "https://www.kraftybot.app/",
        ]),
      /not on kraftybot.app/
    )
    assert.throws(() => indexNowPayload("https://kraftybot.app", []), /No URLs/)
  })
})
