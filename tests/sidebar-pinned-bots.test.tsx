import "./helpers/avatar-motion"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import {
  SidebarPinnedBots,
  type PinnedBotItem,
} from "../components/sidebar-pinned-bots"

afterEach(cleanup)

const items: PinnedBotItem[] = ["Scout", "Quill", "Maker"].map((name) => ({
  id: name.toLowerCase(),
  name,
  content: <a href={`/chats/${name.toLowerCase()}`}>{name}</a>,
}))

test("server refreshes update pins while keeping the same bot handle focused", () => {
  const saveOrder = async () => {}
  const view = render(
    <SidebarPinnedBots version="initial" items={items} saveOrder={saveOrder} />
  )
  const handle = view.getByRole("button", { name: "Reorder Quill" })
  handle.focus()
  view.rerender(
    <SidebarPinnedBots
      version="saved"
      items={[items[1], items[0]]}
      saveOrder={saveOrder}
    />
  )
  assert.deepEqual(
    view.getAllByRole("link").map((link) => link.textContent),
    ["Quill", "Scout"]
  )
  assert.equal(document.activeElement, handle)
})

test("keyboard reordering saves the visible order and preserves chat links", async () => {
  const saved: string[][] = []
  const view = render(
    <SidebarPinnedBots
      version="initial"
      items={items}
      saveOrder={async (ids) => {
        saved.push(ids)
      }}
    />
  )
  const handle = view.getByRole("button", { name: "Reorder Quill" })
  handle.focus()
  fireEvent.keyDown(handle, { key: "ArrowLeft" })
  await waitFor(() =>
    assert.equal(view.getByRole("list").getAttribute("aria-busy"), "false")
  )
  assert.deepEqual(
    view.getAllByRole("link").map((link) => link.textContent),
    ["Quill", "Scout", "Maker"]
  )
  assert.deepEqual(saved, [["quill", "scout", "maker"]])
  assert.equal(document.activeElement, handle)
  assert.equal(
    view.getByRole("link", { name: "Quill" }).getAttribute("href"),
    "/chats/quill"
  )
  fireEvent.keyDown(handle, { key: "End" })
  await waitFor(() => assert.equal(saved.length, 2))
  assert.deepEqual(saved[1], ["scout", "maker", "quill"])
})

test("failed saves restore the previous order and announce the failure", async () => {
  const view = render(
    <SidebarPinnedBots
      version="initial"
      items={items}
      saveOrder={async () => {
        throw new Error("offline")
      }}
    />
  )
  fireEvent.keyDown(view.getByRole("button", { name: "Reorder Scout" }), {
    key: "End",
  })
  await waitFor(() =>
    assert.match(
      view.getByRole("status").textContent!,
      /Previous order restored/
    )
  )
  assert.deepEqual(
    view.getAllByRole("link").map((link) => link.textContent),
    ["Scout", "Quill", "Maker"]
  )
})

test("pending saves prevent overlapping reorders; moving past the edge is a no-op", async () => {
  let resolveSave!: () => void
  const saved: string[][] = []
  const view = render(
    <SidebarPinnedBots
      version="initial"
      items={items}
      saveOrder={(ids) => {
        saved.push(ids)
        return new Promise<void>((resolve) => {
          resolveSave = resolve
        })
      }}
    />
  )
  const handle = view.getByRole("button", { name: "Reorder Scout" })
  fireEvent.keyDown(handle, { key: "Home" })
  assert.equal(saved.length, 0)
  fireEvent.keyDown(handle, { key: "ArrowDown" })
  fireEvent.keyDown(handle, { key: "End" })
  assert.equal(saved.length, 1)
  assert.equal(handle.getAttribute("aria-disabled"), "true")
  resolveSave()
  await waitFor(() => assert.equal(handle.hasAttribute("aria-disabled"), false))
})
