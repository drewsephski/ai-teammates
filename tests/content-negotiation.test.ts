import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { prefersMarkdown } from "@/lib/content-negotiation"

describe("prefersMarkdown", () => {
  it("serves HTML to browsers", () => {
    assert.equal(
      prefersMarkdown(
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      ),
      false
    )
    assert.equal(prefersMarkdown("*/*"), false)
    assert.equal(prefersMarkdown(null), false)
    assert.equal(prefersMarkdown(""), false)
  })

  it("serves Markdown to agents that rank it first", () => {
    assert.equal(prefersMarkdown("text/markdown"), true)
    assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true)
    assert.equal(prefersMarkdown("text/markdown, */*;q=0.1"), true)
    assert.equal(prefersMarkdown("Text/Markdown"), true)
  })

  it("keeps HTML when the client ranks it above Markdown", () => {
    assert.equal(prefersMarkdown("text/html, text/markdown;q=0.5"), false)
    assert.equal(prefersMarkdown("text/markdown;q=0, text/html"), false)
    assert.equal(prefersMarkdown("text/markdown;q=0"), false)
  })

  it("breaks a tie by the order the client listed", () => {
    assert.equal(prefersMarkdown("text/markdown, text/html"), true)
    assert.equal(prefersMarkdown("text/html, text/markdown"), false)
  })
})
