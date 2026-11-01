import assert from "node:assert/strict"
import test from "node:test"

import {
  buildScreenSnapshot,
  MAX_SNAPSHOT_TEXT,
  openUrlSchema,
  parseScreenRead,
  SCREEN_READER_SCRIPT,
  screenReaderCommand,
  visibleCenter,
} from "../lib/screen-reader"

const screen = { width: 1024, height: 768 }

function read(elements: unknown[], extra: Record<string, unknown> = {}) {
  const parsed = parseScreenRead(
    JSON.stringify({
      app: "Firefox",
      window: "Plans · Krafty",
      url: "https://kraftybot.app/pricing",
      elements,
      ...extra,
    })
  )
  assert.ok(!("error" in parsed))
  return parsed
}

test("only named controls on screen get refs, in reading order", () => {
  const snapshot = buildScreenSnapshot(
    read([
      { r: "heading", n: "Plans", d: 3 },
      { r: "link", n: "Home", d: 4, i: 1, x: 10, y: 10, w: 40, h: 20 },
      // Off screen: no ref until it's scrolled to, but listed
      { r: "link", n: "Footer", d: 4, i: 1, x: 10, y: 2000, w: 40, h: 20 },
      // No name and no value: nothing to go on
      { r: "push button", n: "", d: 4, i: 1, x: 60, y: 10, w: 20, h: 20 },
      {
        r: "entry",
        n: "Email",
        v: "sam@example.com",
        s: ["focused", "required"],
        d: 4,
        i: 1,
        x: 100,
        y: 100,
        w: 200,
        h: 30,
      },
      { r: "paragraph", n: "Pick a plan", d: 3 },
      // A section repeating its only paragraph's text
      { r: "section", n: "Pick a plan", d: 2 },
    ]),
    screen
  )
  assert.equal(snapshot.count, 2)
  assert.deepEqual([...snapshot.refs.keys()], ["e1", "e2"])
  assert.equal(snapshot.refs.get("e2")?.name, "Email")
  const lines = snapshot.text.split("\n")
  assert.equal(lines[0], 'Window: Firefox — "Plans · Krafty"')
  assert.equal(lines[1], "URL: https://kraftybot.app/pricing")
  assert.deepEqual(lines.slice(3), [
    'heading "Plans"',
    '[e1] link "Home"',
    'link "Footer" (off screen)',
    '[e2] entry "Email" = "sam@example.com" (focused, required)',
    'text "Pick a plan"',
  ])
})

test("a reading cut short says so, and the text has a ceiling", () => {
  const long = Array.from({ length: 300 }, (_, index) => ({
    r: "paragraph",
    n: `${index} ${"word ".repeat(40)}`.slice(0, 240),
    d: 2,
  }))
  const snapshot = buildScreenSnapshot(
    read(long, { truncated: true, url: null }),
    screen
  )
  assert.ok(snapshot.text.length <= MAX_SNAPSHOT_TEXT + 20)
  assert.match(snapshot.text, /cut short$/)
  assert.doesNotMatch(snapshot.text, /^URL:/m)
  const short = buildScreenSnapshot(
    read([{ r: "heading", n: "Hi", d: 1 }], { truncated: true }),
    screen
  )
  assert.match(short.text, /the window has more than this/)
})

test("an element is clicked in the middle of its visible part", () => {
  assert.deepEqual(
    visibleCenter({ x: 10, y: 10, width: 40, height: 20 }, screen),
    {
      x: 30,
      y: 20,
    }
  )
  // Hanging off the bottom right: the part on screen counts
  assert.deepEqual(
    visibleCenter({ x: 1000, y: 760, width: 100, height: 100 }, screen),
    { x: 1012, y: 764 }
  )
  assert.equal(
    visibleCenter({ x: -100, y: 10, width: 50, height: 20 }, screen),
    null
  )
  assert.equal(
    visibleCenter({ x: 10, y: 10, width: 0, height: 20 }, screen),
    null
  )
})

test("the walker's output is read from its last line, and errors are kept", () => {
  assert.deepEqual(
    parseScreenRead('Gtk-WARNING noise\n{"error":"no-window"}\n'),
    { error: "no-window" }
  )
  assert.throws(() => parseScreenRead("Traceback (most recent call last):"))
  assert.throws(() => parseScreenRead('{"error":"made up"}'))
})

test("the walker travels inline and runs isolated from the user's Python", () => {
  const command = screenReaderCommand(screen)
  assert.match(command, /\| base64 -d \| python3 -I - 1024 768 /)
  const encoded = command.match(/^echo '([A-Za-z0-9+/=]+)'/)?.[1]
  assert.ok(encoded)
  assert.equal(
    Buffer.from(encoded, "base64").toString("utf8"),
    SCREEN_READER_SCRIPT
  )
  // Password fields never have their characters read
  assert.doesNotMatch(SCREEN_READER_SCRIPT, /"password text"\)/)
})

test("only http and https pages open in the desktop's browser", () => {
  for (const url of [
    "https://www.espn.com/fantasy/",
    "http://localhost:3000/",
    "https://example.com/search?q=a%20b",
  ])
    assert.equal(openUrlSchema.safeParse(url).success, true, url)
  for (const url of [
    "javascript:alert(1)",
    "file:///home/user/.mozilla/firefox",
    "data:text/html,<script>1</script>",
    "https://example.com/a b",
    "example.com",
    "--new-instance",
    "about:config",
  ])
    assert.equal(openUrlSchema.safeParse(url).success, false, url)
})
