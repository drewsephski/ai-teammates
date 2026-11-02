// Opening a web page in the desktop's browser and waiting until it's really
// there: the browser window up, the document at the address, no longer
// loading. Pure apart from the injected command runner, so tests run offline;
// lib/sandbox-tools.ts runs it on the computer.
import {
  parseScreenRead,
  READ_TIMEOUT_MS,
  screenReaderCommand,
  type ScreenRead,
} from "@/lib/screen-reader"
import { shellQuote } from "@/lib/computer-shell"

export type PageExec = (
  command: string,
  options?: {
    timeoutMs?: number
    // Start it and return at once, as for the browser itself
    background?: boolean
    envs?: Record<string, string>
  }
) => Promise<{ stdout: string; exitCode: number }>

export type PageDeps = {
  exec: PageExec
  screen: { width: number; height: number }
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

// How long a page gets to appear, and how long the browser gets to show a
// window before it's taken as hung and restarted. A browser that survived a
// pause and resume can sit there with a black window; the desktop itself can
// take several seconds to paint after a resume.
export const PAGE_WAIT_MS = 25_000
export const BROWSER_START_MS = 12_000
export const PAGE_POLL_MS = 1500
// The browser process on the desktop (the Firefox ESR wrapper's real binary)
export const BROWSER_PROCESS = "firefox-esr"

export type PageRead = Extract<ScreenRead, { elements: unknown }>
export type OpenedPage = {
  // loaded: the page is there and done loading. loading: it's there but still
  // loading when time ran out, so the reading may be partial. opening: no
  // browser window showed the page in time.
  status: "loaded" | "loading" | "opening"
  read?: PageRead
  // The browser was unresponsive and was restarted
  restarted: boolean
  ms: number
}

function hostname(value: string | null | undefined) {
  try {
    return value ? new URL(value).hostname.replace(/^www\./, "") : null
  } catch {
    return null
  }
}

// Whether a document URL is the page that was asked for, or where it sent us
export function pageMatches(
  documentUrl: string | null | undefined,
  requested: string,
  before?: string | null
) {
  if (!documentUrl) return false
  if (documentUrl === requested) return true
  const host = hostname(documentUrl)
  if (host && host === hostname(requested)) return true
  // A sign-in or short link sends the browser elsewhere: a new document is
  // still the page opening, as long as it isn't the one that was there before
  return !!before && documentUrl !== before && !/^about:/.test(documentUrl)
}

const isBrowser = (read: ScreenRead) =>
  !("error" in read) && /firefox|chrom|browser/i.test(read.app)

async function readOnce(deps: PageDeps): Promise<ScreenRead | undefined> {
  try {
    const result = await deps.exec(screenReaderCommand(deps.screen), {
      timeoutMs: READ_TIMEOUT_MS,
    })
    return parseScreenRead(result.stdout)
  } catch {
    return undefined
  }
}

export function launchCommand(url: string) {
  return `x-www-browser ${shellQuote(url)} >/dev/null 2>&1`
}

async function launch(deps: PageDeps, url: string) {
  // The desktop's browser, as its own user, with its accessibility tree on
  // so readScreen can read the page (the template's wrapper sets it too)
  await deps.exec(launchCommand(url), {
    background: true,
    envs: { GNOME_ACCESSIBILITY: "1" },
  })
}

async function browserRunning(deps: PageDeps) {
  try {
    const result = await deps.exec(`pgrep -x ${BROWSER_PROCESS}`, {
      timeoutMs: 5000,
    })
    return result.exitCode === 0 && result.stdout.trim() !== ""
  } catch {
    return false
  }
}

// A browser with a process but no readable window is hung (seen after a
// resume): close it and start it again. The profile, with its sign-ins, is
// on disk and survives.
async function restartBrowser(
  deps: PageDeps,
  sleep: (ms: number) => Promise<void>
) {
  try {
    await deps.exec(`pkill -x ${BROWSER_PROCESS}`, { timeoutMs: 5000 })
    await sleep(1500)
    await deps.exec(`pkill -9 -x ${BROWSER_PROCESS}; sleep 0.5`, {
      timeoutMs: 5000,
    })
  } catch {
    // Nothing to kill, or it's gone already
  }
}

export async function openBrowserPage(
  deps: PageDeps,
  url: string,
  options: { waitMs?: number; startMs?: number } = {}
): Promise<OpenedPage> {
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = deps.now ?? Date.now
  const waitMs = options.waitMs ?? PAGE_WAIT_MS
  const startMs = options.startMs ?? BROWSER_START_MS
  const started = now()
  // What the browser showed before, so a new document counts as the page
  const before = await readOnce(deps)
  const beforeUrl = before && !("error" in before) ? before.url : null
  await launch(deps, url)
  let deadline = started + waitMs
  let restartAfter = started + startMs
  let restarted = false
  let last: PageRead | undefined
  let windowSeen = false
  for (;;) {
    await sleep(PAGE_POLL_MS)
    const read = await readOnce(deps)
    if (read && isBrowser(read)) {
      windowSeen = true
      last = read as PageRead
      if (pageMatches(last.url, url, beforeUrl) && !last.busy)
        return { status: "loaded", read: last, restarted, ms: now() - started }
    }
    const elapsed = now() - started
    if (!windowSeen && !restarted && now() >= restartAfter) {
      // No window this long: a hung browser is restarted once; one that never
      // started (or died) is started again
      restarted = true
      if (await browserRunning(deps)) await restartBrowser(deps, sleep)
      await launch(deps, url)
      deadline = now() + waitMs
      restartAfter = Infinity
      continue
    }
    if (now() >= deadline) {
      if (last && pageMatches(last.url, url, beforeUrl))
        return { status: "loading", read: last, restarted, ms: elapsed }
      return { status: "opening", read: last, restarted, ms: elapsed }
    }
  }
}

// readScreen with a little patience: a page that just opened, or a desktop
// that just resumed, can have nothing to read for a moment
export async function readScreenPatiently(
  deps: PageDeps,
  options: { attempts?: number; pollMs?: number } = {}
) {
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const attempts = options.attempts ?? 3
  let read: ScreenRead | undefined
  for (let attempt = 0; attempt < attempts; attempt++) {
    read = await readOnce(deps)
    if (read && !("error" in read) && read.elements.length && !read.busy)
      return read
    if (attempt < attempts - 1) await sleep(options.pollMs ?? PAGE_POLL_MS)
  }
  return read
}
