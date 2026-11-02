import assert from "node:assert/strict"
import test from "node:test"

import {
  BROWSER_START_MS,
  launchCommand,
  openBrowserPage,
  PAGE_WAIT_MS,
  pageMatches,
  readScreenPatiently,
  type PageExec,
} from "../lib/browser-page"

const screen = { width: 1024, height: 768 }
const page = (url: string | null, busy = false, app = "Firefox") =>
  JSON.stringify({
    app,
    window: "Page — Mozilla Firefox",
    url,
    busy,
    elements: url ? [{ r: "link", n: "Home", d: 1, i: 1 }] : [],
  })
const noWindow = JSON.stringify({ error: "no-window" })

// A fake desktop: what each screen read returns in turn, and the commands run
function desktop(reads: string[], options: { running?: boolean } = {}) {
  const commands: string[] = []
  let clock = 0
  const exec: PageExec = async (command, opts = {}) => {
    commands.push(opts.background ? `bg:${command}` : command)
    if (command.startsWith("pgrep"))
      return options.running
        ? { stdout: "123\n", exitCode: 0 }
        : { stdout: "", exitCode: 1 }
    if (command.startsWith("echo")) {
      const next = reads.length > 1 ? reads.shift()! : reads[0]
      return { stdout: `noise\n${next}\n`, exitCode: 0 }
    }
    return { stdout: "", exitCode: 0 }
  }
  return {
    commands,
    deps: {
      exec,
      screen,
      sleep: async (ms: number) => {
        clock += ms
      },
      now: () => clock,
    },
  }
}

test("opening a page launches the browser and returns the page once it has loaded", async () => {
  const fake = desktop([
    noWindow, // before launch
    noWindow,
    page("https://www.espn.com/fantasy/football/", true),
    page("https://www.espn.com/fantasy/football/"),
  ])
  const opened = await openBrowserPage(
    fake.deps,
    "https://www.espn.com/fantasy/football/"
  )
  assert.equal(opened.status, "loaded")
  assert.equal(opened.restarted, false)
  assert.equal(opened.read?.url, "https://www.espn.com/fantasy/football/")
  assert.equal(
    fake.commands.filter((command) => command.startsWith("bg:")).length,
    1
  )
  assert.equal(
    fake.commands[1],
    `bg:${launchCommand("https://www.espn.com/fantasy/football/")}`
  )
  assert.match(launchCommand("https://a.test/?q='x'"), /x-www-browser 'https:/)
})

test("a page that sends the browser elsewhere still counts as opened", async () => {
  const fake = desktop([
    page("https://www.espn.com/fantasy/football/"), // the tab before
    page("https://www.espn.com/fantasy/football/"),
    page("https://registerdisney.go.com/login"),
  ])
  const opened = await openBrowserPage(
    fake.deps,
    "https://fantasy.espn.com/football/team?leagueId=1&teamId=1"
  )
  assert.equal(opened.status, "loaded")
  assert.equal(opened.read?.url, "https://registerdisney.go.com/login")
})

test("a browser with a process but no window is restarted once, then the page opens", async () => {
  const reads = [noWindow]
  const fake = desktop(reads, { running: true })
  const original = fake.deps.exec
  let launches = 0
  fake.deps.exec = async (command, opts) => {
    if (opts?.background && ++launches === 2)
      reads.push(page("https://example.com/"))
    return original(command, opts)
  }
  const opened = await openBrowserPage(fake.deps, "https://example.com/")
  assert.equal(opened.status, "loaded")
  assert.equal(opened.restarted, true)
  assert.ok(
    fake.commands.some((command) => /pkill -x firefox-esr/.test(command))
  )
  assert.equal(launches, 2)
  // Not before the browser had its chance to start
  const restartAt = fake.commands.findIndex((command) => /pkill/.test(command))
  assert.ok(restartAt > BROWSER_START_MS / 1500 - 1)
})

test("a browser that never shows the page reports that, with the last reading", async () => {
  const fake = desktop([
    noWindow,
    page("https://other.test/", false, "Mousepad"),
  ])
  const opened = await openBrowserPage(fake.deps, "https://example.com/", {
    waitMs: 6000,
    startMs: 3000,
  })
  assert.equal(opened.status, "opening")
  assert.equal(opened.restarted, true)
  assert.ok(opened.ms >= 6000)
  assert.ok(opened.ms < 2 * PAGE_WAIT_MS)
})

test("a page still loading when time runs out is returned as loading", async () => {
  const fake = desktop([noWindow, page("https://example.com/", true)])
  const opened = await openBrowserPage(fake.deps, "https://example.com/", {
    waitMs: 4500,
  })
  assert.equal(opened.status, "loading")
  assert.equal(opened.read?.busy, true)
})

test("readScreen waits a moment for a page that is loading or empty", async () => {
  const fake = desktop([
    noWindow,
    page("https://example.com/", true),
    page("https://example.com/"),
  ])
  const read = await readScreenPatiently(fake.deps)
  assert.ok(read && !("error" in read))
  assert.equal(read.busy, false)
  // Three reads, two waits
  assert.equal(fake.commands.filter((c) => c.startsWith("echo")).length, 3)

  const still = desktop([noWindow])
  const none = await readScreenPatiently(still.deps, { attempts: 2 })
  assert.deepEqual(none, { error: "no-window" })
})

test("what counts as the requested page", () => {
  const asked = "https://fantasy.espn.com/football/team?leagueId=1&teamId=2"
  assert.equal(pageMatches(asked, asked), true)
  assert.equal(pageMatches("https://www.fantasy.espn.com/x", asked), true)
  assert.equal(pageMatches(null, asked), false)
  assert.equal(pageMatches("about:blank", asked, "https://a.test/"), false)
  // Somewhere new is the page opening; the tab that was there before isn't
  assert.equal(
    pageMatches("https://login.test/", asked, "https://a.test/"),
    true
  )
  assert.equal(pageMatches("https://a.test/", asked, "https://a.test/"), false)
  assert.equal(pageMatches("https://a.test/", asked), false)
})
