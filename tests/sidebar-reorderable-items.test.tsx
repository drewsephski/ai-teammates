import {
  advanceAvatarFrames,
  setAvatarReducedMotion,
} from "./helpers/avatar-motion"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"
import {
  SidebarReorderableItems,
  type SidebarReorderableItem,
} from "../components/sidebar-reorderable-items"

afterEach(cleanup)

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly isPrimary: boolean
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? "mouse"
    this.isPrimary = init.isPrimary ?? true
  }
}
Object.defineProperty(window, "PointerEvent", { value: TestPointerEvent })
Object.defineProperty(globalThis, "getComputedStyle", {
  configurable: true,
  value: window.getComputedStyle.bind(window),
})
const items: SidebarReorderableItem[] = ["Scout", "Quill", "Maker"].map(
  (name) => ({
    id: name.toLowerCase(),
    name,
    content: <a href={`/chats/${name.toLowerCase()}`}>{name}</a>,
  })
)
function viewFor(
  saveOrder: (ids: string[]) => Promise<void>,
  layout: "grid" | "list" = "grid",
  columns = layout === "grid" ? 2 : 1
) {
  measuredColumns = columns
  return render(
    <SidebarReorderableItems
      items={items}
      version="initial"
      label="Bots"
      layout={layout}
      saveOrder={saveOrder}
    />
  )
}
const order = (view: ReturnType<typeof render>) =>
  view.getAllByRole("link").map((link) => link.textContent)

// Real Motion gestures, with JSDOM's missing layout supplied as measured slots.
let measuredColumns = 2
const rect = (x: number, y: number, width: number, height: number) =>
  ({
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect
const originalRect = HTMLElement.prototype.getBoundingClientRect
HTMLElement.prototype.getBoundingClientRect = function () {
  const columns = measuredColumns
  if (this.matches('ul[aria-label="Bots"]'))
    return rect(
      20,
      100,
      columns * 84 - 4,
      Math.ceil(items.length / columns) * 104 - 4
    )
  if (this.matches("[data-item-id]")) {
    const index = [...this.parentElement!.children].indexOf(this)
    const transform = this.style.transform
    const translate = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)
    const offsetX = Number(
      translate?.[1] ?? transform.match(/translateX\(([-\d.]+)px/)?.[1] ?? 0
    )
    const offsetY = Number(
      translate?.[2] ?? transform.match(/translateY\(([-\d.]+)px/)?.[1] ?? 0
    )
    return rect(
      20 + (index % columns) * 84 + offsetX,
      100 + Math.floor(index / columns) * 104 + offsetY,
      80,
      100
    )
  }
  return originalRect.call(this)
}
function geometry(view: ReturnType<typeof render>) {
  const grid = view.getByRole("list")
  return {
    grid,
    tile: grid.children[0] as HTMLElement,
    link: view.getByRole("link", { name: "Scout" }),
  }
}
let clock = 0
function frames() {
  act(() => advanceAvatarFrames(clock, 128))
  clock += 144
}
function start(link: HTMLElement) {
  fireEvent.pointerDown(link, {
    button: 0,
    clientX: 60,
    clientY: 150,
    pointerId: 1,
    isPrimary: true,
  })
}
function move(x: number, y: number) {
  fireEvent.pointerMove(window, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
  })
  frames()
}
function end(x: number, y: number) {
  fireEvent.pointerUp(window, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
  })
  frames()
}

async function dragTo(x: number, y: number) {
  // Motion derives velocity from real event times, as it does in a browser.
  for (let step = 1; step <= 8; step++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 8))
    })
    move(60 + ((x - 60) * step) / 8, 150 + ((y - 150) * step) / 8)
  }
}

test("whole items are draggable without handles; ordinary clicks and keyboard navigation remain available", () => {
  const view = viewFor(async () => {})
  assert.equal(view.queryAllByRole("button").length, 0)
  const { link } = geometry(view)
  start(link)
  end(60, 150)
  assert.equal(fireEvent.click(link, { detail: 1 }), true)
  assert.equal(link.getAttribute("href"), "/chats/scout")
  fireEvent.keyDown(link, { key: "ArrowRight" })
  assert.deepEqual(order(view), ["Scout", "Quill", "Maker"])
})

test("Alt+arrows and Home/End save ordering on the existing focused chat link", async () => {
  const saved: string[][] = []
  const view = viewFor(async (ids) => {
    saved.push(ids)
  }, "list")
  const link = view.getByRole("link", { name: "Quill" })
  link.focus()
  fireEvent.keyDown(link, { altKey: true, key: "ArrowUp" })
  await waitFor(() => assert.deepEqual(saved, [["quill", "scout", "maker"]]))
  assert.deepEqual(order(view), ["Quill", "Scout", "Maker"])
  assert.equal(document.activeElement, link)
  await waitFor(() =>
    assert.equal(view.getByRole("list").getAttribute("aria-busy"), "false")
  )
  fireEvent.keyDown(link, { altKey: true, key: "End" })
  await waitFor(() => assert.equal(saved.length, 2))
  assert.deepEqual(saved[1], ["scout", "maker", "quill"])
})

test("failed saves restore the previous order", async () => {
  const view = viewFor(async () => {
    throw Error("offline")
  })
  fireEvent.keyDown(view.getByRole("link", { name: "Scout" }), {
    altKey: true,
    key: "End",
  })
  await waitFor(() =>
    assert.match(
      view.getByRole("status").textContent!,
      /Previous order restored/
    )
  )
  assert.deepEqual(order(view), ["Scout", "Quill", "Maker"])
})

test("pending saves block overlapping reorders", async () => {
  let resolve!: () => void
  const saved: string[][] = []
  const view = viewFor((ids) => {
    saved.push(ids)
    return new Promise<void>((done) => {
      resolve = done
    })
  })
  const link = view.getByRole("link", { name: "Scout" })
  fireEvent.keyDown(link, { altKey: true, key: "Home" })
  assert.equal(saved.length, 0)
  fireEvent.keyDown(link, { altKey: true, key: "End" })
  fireEvent.keyDown(link, { altKey: true, key: "Home" })
  assert.equal(saved.length, 1)
  resolve()
  await waitFor(() =>
    assert.equal(view.getByRole("list").getAttribute("aria-busy"), "false")
  )
})

for (const [layout, columns] of [
  ["grid", 2],
  ["grid", 3],
  ["list", 1],
] as const) {
  test(`Motion drags whole ${layout} items across ${columns} columns and suppresses drag clicks`, async () => {
    const saved: string[][] = []
    const view = viewFor(
      async (ids) => {
        saved.push(ids)
      },
      layout,
      columns
    )
    const { link, tile } = geometry(view)
    frames()
    start(link)
    move(80, 155)
    assert.equal(tile.dataset.dragging, "true")
    const targetX = 20 + (2 % columns) * 84 + 60
    const targetY = 100 + Math.floor(2 / columns) * 104 + 70
    await dragTo(targetX, targetY)
    end(targetX, targetY)
    await waitFor(() => assert.equal(saved.length, 1))
    assert.deepEqual(saved[0], ["quill", "maker", "scout"])
    assert.equal(fireEvent.click(link, { detail: 1 }), false)
    assert.equal(fireEvent.click(link, { detail: 0 }), true)
  })
}

for (const cancel of ["outside", "Escape", "pointercancel"] as const) {
  test(`${cancel} restores the original order without saving`, async () => {
    const saved: string[][] = []
    const view = viewFor(async (ids) => {
      saved.push(ids)
    })
    const { link } = geometry(view)
    frames()
    start(link)
    await dragTo(160, 170)
    assert.notDeepEqual(order(view), ["Scout", "Quill", "Maker"])
    if (cancel === "Escape") fireEvent.keyDown(link, { key: "Escape" })
    else if (cancel === "pointercancel") {
      fireEvent.pointerCancel(window, { pointerId: 1 })
      frames()
    } else end(140, 350)
    frames()
    assert.equal(saved.length, 0)
    assert.deepEqual(order(view), ["Scout", "Quill", "Maker"])
  })
}

test("a quick drag saves its first reorder before the deferred drag-start callback", async () => {
  const saved: string[][] = []
  const view = viewFor(async (ids) => {
    saved.push(ids)
  })
  const { link } = geometry(view)
  frames()
  start(link)
  move(160, 170)
  end(160, 170)
  await waitFor(() => assert.deepEqual(saved, [["quill", "scout", "maker"]]))
})

test("refreshes retain focused links and cancel in-flight drags", () => {
  const saved: string[][] = []
  const saveOrder = async (ids: string[]) => {
    saved.push(ids)
  }
  const view = viewFor(saveOrder)
  const { link } = geometry(view)
  link.focus()
  frames()
  start(link)
  move(130, 155)
  view.rerender(
    <SidebarReorderableItems
      label="Bots"
      version="changed"
      items={[items[1], items[0]]}
      saveOrder={saveOrder}
    />
  )
  end(130, 155)
  assert.deepEqual(order(view), ["Quill", "Scout"])
  assert.equal(document.activeElement, link)
  assert.equal(saved.length, 0)
})

test("reduced motion drops reset drag transforms immediately", async () => {
  act(() => setAvatarReducedMotion(true))
  try {
    const saved: string[][] = []
    const view = viewFor(async (ids) => {
      saved.push(ids)
    })
    const { link, tile } = geometry(view)
    frames()
    start(link)
    await dragTo(160, 170)
    end(160, 170)
    await waitFor(() => assert.equal(saved.length, 1))
    frames()
    assert.ok(!tile.style.transform || tile.style.transform === "none")
  } finally {
    act(() => setAvatarReducedMotion(false))
  }
})
