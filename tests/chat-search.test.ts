import assert from "node:assert/strict"
import test from "node:test"
import { chatSearchContent } from "../lib/chat-search"

test("search indexes group names, every teammate's name and role, and readable previews", () => {
  const result = chatSearchContent({
    name: "Launch plan",
    bots: [
      { name: "Alex", job: "Designer" },
      { name: "Sam", job: "Engineer" },
    ],
    lastMessagePreview:
      "Review **accessibility** in [checkout](https://example.com)",
  })
  assert.deepEqual(result.keywords, [
    "Launch plan",
    "Alex",
    "Designer",
    "Sam",
    "Engineer",
    "Review accessibility in checkout",
  ])
  assert.equal(result.teammates, "Alex · Designer, Sam · Engineer")
  assert.equal(result.preview, "Review accessibility in checkout")
})

test("unnamed chats stay searchable and incomplete roles or previews leave no empty keywords", () => {
  const result = chatSearchContent({
    name: null,
    bots: [{ name: "Alex", job: null }],
    lastMessagePreview: null,
  })
  assert.equal(result.title, "Alex")
  assert.equal(result.teammates, "Alex")
  assert.equal(result.preview, "")
  assert.ok(result.keywords.includes("Alex"))
  assert.ok(result.keywords.every(Boolean))
})
