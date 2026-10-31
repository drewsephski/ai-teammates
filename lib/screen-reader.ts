// Reads the focused window on the computer as text through the desktop's
// accessibility tree (AT-SPI), so a bot can find a control by its role and
// name instead of guessing pixels. Pure: the walker below runs on the computer
// as the desktop's user, and this module parses and formats what it prints.
// Clicks on an element still go through the gesture guard at the element's
// screen position (lib/sandbox-tools.ts): the tree is page content, so a role
// or name never decides whether a step may run.
import { z } from "zod"

import { shellQuote } from "@/lib/computer-shell"

// Room for a busy page without one snapshot filling the model's context
export const MAX_VISITED = 4000
export const MAX_ELEMENTS = 350
const MAX_NAME = 150
const MAX_TEXT = 240
export const MAX_SNAPSHOT_TEXT = 14_000
// Under the command's own timeout, so a slow page returns what it has
const WALK_SECONDS = 12
export const READ_TIMEOUT_MS = 20_000

// Walks the active window depth first, skipping what isn't on screen. Prints
// one JSON object. Python's -I keeps the user's site and environment out.
export const SCREEN_READER_SCRIPT = String.raw`
import json, sys, time
try:
    import gi
    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi
except Exception as error:
    print(json.dumps({"error": "unavailable", "detail": str(error)[:200]}))
    sys.exit(0)

S = Atspi.StateType
WIDTH, HEIGHT = int(sys.argv[1]), int(sys.argv[2])
MAX_VISITED, MAX_ELEMENTS = int(sys.argv[3]), int(sys.argv[4])
MAX_NAME, MAX_TEXT = int(sys.argv[5]), int(sys.argv[6])
DEADLINE = time.monotonic() + float(sys.argv[7])

INTERACTIVE = {
    "push button", "toggle button", "check box", "radio button", "combo box",
    "entry", "password text", "link", "menu item", "check menu item",
    "radio menu item", "page tab", "spin button", "slider", "tree item",
    "menu", "switch", "button",
}
TEXT = {
    "heading", "paragraph", "label", "static", "caption", "text",
    "table cell", "table column header", "table row header", "list item",
    "description term", "description value", "block quote", "status",
    "alert", "notification", "section", "article", "form", "dialog",
}
LEAVES = {"push button", "toggle button", "check box", "radio button", "link",
          "entry", "password text", "menu item", "spin button", "slider"}

class Stop(Exception):
    pass

def clean(text, limit):
    text = " ".join((text or "").replace("￼", " ").split())
    return text[:limit]

def own_text(acc, interfaces):
    if "Text" not in interfaces:
        return ""
    try:
        count = Atspi.Text.get_character_count(acc)
        return Atspi.Text.get_text(acc, 0, min(count, MAX_TEXT * 2))
    except Exception:
        return ""

# The desktop's own parts report windows too: xfwm4 an empty "active" one
SHELL_APPS = {"xfwm4", "xfce4-panel", "xfdesktop", "xfce4-notifyd", "xfce4-session", "xfce4-screensaver"}

def window():
    desktop = Atspi.get_desktop(0)
    active, showing, backdrop = None, None, None
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app is None:
            continue
        try:
            name = app.get_name()
            count = app.get_child_count()
        except Exception:
            continue
        for j in range(count):
            win = app.get_child_at_index(j)
            if win is None:
                continue
            try:
                states = win.get_state_set()
                children = win.get_child_count()
            except Exception:
                continue
            if name in SHELL_APPS:
                if name == "xfdesktop" and backdrop is None:
                    backdrop = (app, win)
                continue
            if states.contains(S.ACTIVE) and active is None:
                active = (app, win)
            elif states.contains(S.SHOWING) and children and showing is None:
                showing = (app, win)
    return active or showing or backdrop or (None, None)

out = []
visited = 0
url = None
truncated = False

# Inside a web page, what's scrolled out of view is read too, so a bot can
# read a whole article; elsewhere what isn't showing is skipped
def walk(acc, depth, in_page=False):
    global visited, url
    if visited >= MAX_VISITED or len(out) >= MAX_ELEMENTS or time.monotonic() > DEADLINE:
        raise Stop()
    visited += 1
    try:
        states = acc.get_state_set()
        role = acc.get_role_name()
        interfaces = set(acc.get_interfaces())
        name = clean(acc.get_name(), MAX_NAME)
    except Exception:
        return
    if depth > 0 and not in_page and not states.contains(S.SHOWING):
        return
    if role == "document web" and url is None and "Document" in interfaces:
        try:
            url = Atspi.Document.get_document_attribute_value(acc, "DocURL")
        except Exception:
            pass
    interactive = role in INTERACTIVE or (
        states.contains(S.FOCUSABLE) and role not in ("document web", "frame", "panel", "scroll pane", "filler", "section", "internal frame")
    )
    entry = {"r": role, "n": name, "d": depth}
    flags = []
    for flag, state in (("focused", S.FOCUSED), ("checked", S.CHECKED), ("selected", S.SELECTED), ("expanded", S.EXPANDED), ("required", S.REQUIRED)):
        if states.contains(state):
            flags.append(flag)
    if interactive and not states.contains(S.SENSITIVE):
        flags.append("disabled")
    if flags:
        entry["s"] = flags
    # A password field's characters are never read out
    if role in ("entry", "spin button", "combo box"):
        entry["v"] = clean(own_text(acc, interfaces), MAX_NAME)
    if interactive and "Component" in interfaces:
        try:
            box = Atspi.Component.get_extents(acc, Atspi.CoordType.SCREEN)
            entry["x"], entry["y"], entry["w"], entry["h"] = box.x, box.y, box.width, box.height
        except Exception:
            pass
    if interactive:
        entry["i"] = 1
        out.append(entry)
    elif role in TEXT:
        text = clean(own_text(acc, interfaces), MAX_TEXT) or (name if role in ("heading", "label", "status", "alert", "dialog") else "")
        if text:
            entry["n"] = text
            out.append(entry)
    if role in LEAVES:
        return
    try:
        count = acc.get_child_count()
    except Exception:
        return
    for i in range(count):
        try:
            child = acc.get_child_at_index(i)
        except Exception:
            continue
        if child is not None:
            walk(child, depth + 1, in_page or role == "document web")

app, win = window()
if win is None:
    print(json.dumps({"error": "no-window"}))
    sys.exit(0)
try:
    walk(win, 0)
except Stop:
    truncated = True
print(json.dumps({
    "app": clean(app.get_name(), MAX_NAME),
    "window": clean(win.get_name(), MAX_NAME),
    "url": url,
    "elements": out,
    "truncated": truncated,
}))
`

// The command that runs the walker: the script travels inline, so nothing on
// the computer can swap it, and runs with the display's size as bounds
export function screenReaderCommand(screen: { width: number; height: number }) {
  const script = Buffer.from(SCREEN_READER_SCRIPT, "utf8").toString("base64")
  const args = [
    screen.width,
    screen.height,
    MAX_VISITED,
    MAX_ELEMENTS,
    MAX_NAME,
    MAX_TEXT,
    WALK_SECONDS,
  ].join(" ")
  return `echo ${shellQuote(script)} | base64 -d | python3 -I - ${args}`
}

const rawElementSchema = z.object({
  r: z.string().max(60),
  n: z
    .string()
    .max(MAX_TEXT * 2)
    .default(""),
  d: z.number().int().min(0).max(10_000).default(0),
  s: z.array(z.string().max(20)).max(10).optional(),
  v: z
    .string()
    .max(MAX_TEXT * 2)
    .optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  i: z.literal(1).optional(),
})

export const screenReadSchema = z.union([
  z.object({
    error: z.enum(["unavailable", "no-window"]),
    detail: z.string().optional(),
  }),
  z.object({
    app: z.string().default(""),
    window: z.string().default(""),
    url: z.string().max(4000).nullable().default(null),
    elements: z.array(rawElementSchema).max(MAX_ELEMENTS + 10),
    truncated: z.boolean().default(false),
  }),
])
export type ScreenRead = z.infer<typeof screenReadSchema>

export type ScreenElement = {
  ref: string
  role: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

export type ScreenSnapshot = {
  text: string
  screen: { width: number; height: number }
  // Interactive elements on screen, by ref, for clickElement and fillElement
  refs: Map<string, ScreenElement>
  count: number
}

export const SCREEN_UNREADABLE =
  "This window couldn't be read as text. Use viewScreen to look at it instead."

export function parseScreenRead(stdout: string): ScreenRead {
  const line = stdout.trim().split("\n").pop() ?? ""
  return screenReadSchema.parse(JSON.parse(line))
}

function quoted(text: string) {
  return JSON.stringify(text)
}

// Where on screen an element can be clicked: the middle of its visible part,
// or null when none of it is on screen
export function visibleCenter(
  box: { x: number; y: number; width: number; height: number },
  screen: { width: number; height: number }
) {
  const left = Math.max(0, box.x)
  const top = Math.max(0, box.y)
  const right = Math.min(screen.width, box.x + box.width)
  const bottom = Math.min(screen.height, box.y + box.height)
  if (right - left < 1 || bottom - top < 1) return null
  return {
    x: Math.min(screen.width - 1, Math.floor((left + right) / 2)),
    y: Math.min(screen.height - 1, Math.floor((top + bottom) / 2)),
  }
}

// The window as the model reads it: one line per element, refs only on the
// interactive ones that are on screen
export function buildScreenSnapshot(
  read: Extract<ScreenRead, { elements: unknown }>,
  screen: { width: number; height: number }
): ScreenSnapshot {
  const refs = new Map<string, ScreenElement>()
  const lines: string[] = []
  let previous = ""
  for (const element of read.elements) {
    const states = element.s?.length ? ` (${element.s.join(", ")})` : ""
    const value =
      element.v !== undefined && element.v !== element.n
        ? ` = ${quoted(element.v)}`
        : ""
    let line: string
    if (element.i) {
      const box =
        element.x !== undefined &&
        element.y !== undefined &&
        element.w !== undefined &&
        element.h !== undefined
          ? {
              x: element.x,
              y: element.y,
              width: element.w,
              height: element.h,
            }
          : undefined
      // A control with no name and no value gives the model nothing to go on
      if (!element.n && element.v === undefined) continue
      const center = box && visibleCenter(box, screen)
      if (center && box) {
        const ref = `e${refs.size + 1}`
        refs.set(ref, { ref, role: element.r, name: element.n, ...box })
        line = `[${ref}] ${element.r} ${quoted(element.n)}${value}${states}`
      } else
        // Scrolled out of view: listed so the bot knows to scroll to it
        line = `${element.r} ${quoted(element.n)}${value}${states} (off screen)`
    } else {
      line =
        element.r === "heading"
          ? `heading ${quoted(element.n)}`
          : `text ${quoted(element.n)}`
      // A container often repeats its only child's text
      if (line === previous) continue
    }
    previous = line
    lines.push(line)
  }
  const header = [
    `Window: ${read.app || "unknown app"} — ${quoted(read.window)}`,
    read.url ? `URL: ${read.url}` : undefined,
    `Screen: ${screen.width}x${screen.height}. Refs belong to this reading only; read again after the screen changes. Controls marked off screen have no ref: scroll to them, then read again.`,
  ].filter(Boolean)
  const footer = read.truncated
    ? ["… the window has more than this; scroll or use viewScreen for the rest"]
    : []
  let text = [...header, ...lines, ...footer].join("\n")
  if (text.length > MAX_SNAPSHOT_TEXT)
    text = `${text.slice(0, MAX_SNAPSHOT_TEXT)}\n… cut short`
  return { text, screen, refs, count: refs.size }
}

// A web address the browser may open: http or https only, so no file, data or
// javascript URL reaches the desktop's browser
export const openUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (/\s/.test(value)) return false
    try {
      const url = new URL(value)
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !!url.hostname
      )
    } catch {
      return false
    }
  }, "Use a full http or https address, such as https://example.com.")
