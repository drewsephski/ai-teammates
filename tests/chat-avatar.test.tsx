import {
  advanceAvatarFrames,
  avatarFrameCount,
  setAvatarReducedMotion,
  setAvatarsVisible,
} from "./helpers/avatar-motion"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { ChatAvatar, avatarInk } from "../components/chat-avatar"
import { GroupChatAvatar } from "../components/group-chat-avatar"
import { botColors } from "../lib/bot-avatar"
import { CHARACTER_GEOMETRY } from "../components/landing/bot/character-geometry"
import {
  avatarBodyTargets,
  avatarScale,
} from "../components/landing/bot/character-avatar-motion"

afterEach(() => {
  cleanup()
  setAvatarReducedMotion(false)
})
const seed = "blob:egg:0"
const gazeSvg = (container: HTMLElement) => {
  const uri = container.querySelector("img")!.getAttribute("src")!
  return uri.includes(";base64,")
    ? Buffer.from(uri.split(",")[1], "base64").toString()
    : decodeURIComponent(uri.slice(uri.indexOf(",") + 1))
}

test("native activity preserves the silhouette and interpolates instead of remounting", () => {
  const view = render(<ChatAvatar seed={seed} state="thinking" />)
  act(() => advanceAvatarFrames(0, 600))
  const svg = view.container.querySelector("svg")!
  const body = svg.querySelector("g:has(> path[fill='currentColor'])")!
  const before = body.getAttribute("transform")
  assert.equal(
    body.querySelector("path[fill='currentColor']")?.getAttribute("d"),
    CHARACTER_GEOMETRY.egg.head
  )
  assert.ok(
    [...svg.querySelectorAll("g > g path")].some(
      (eye) => eye.getAttribute("d")?.length
    )
  )
  view.rerender(<ChatAvatar seed={seed} state="working" />)
  assert.equal(view.container.querySelector("svg"), svg)
  assert.equal(body.getAttribute("transform"), before)
  act(() => advanceAvatarFrames(616, 600))
  assert.notEqual(body.getAttribute("transform"), before)
  view.rerender(<ChatAvatar seed={seed} state="idle" />)
  act(() => advanceAvatarFrames(1232, 1300))
  assert.equal(avatarFrameCount(), 0)
  assert.equal(
    body.querySelector("path[fill='currentColor']")?.getAttribute("d"),
    CHARACTER_GEOMETRY.egg.head
  )
})

test("historical and queued avatars are still; reduced motion and offscreen activity stop frames", () => {
  const view = render(<ChatAvatar seed={seed} state="idle" />)
  assert.equal(avatarFrameCount(), 0)
  view.rerender(<ChatAvatar seed={seed} state="queued" />)
  assert.equal(avatarFrameCount(), 0)
  view.rerender(<ChatAvatar seed={seed} state="responding" />)
  assert.equal(avatarFrameCount(), 1)
  act(() => setAvatarsVisible(false))
  assert.equal(avatarFrameCount(), 0)
  act(() => setAvatarsVisible(true))
  assert.equal(avatarFrameCount(), 1)
  act(() => setAvatarReducedMotion(true))
  assert.equal(avatarFrameCount(), 0)
  assert.equal(
    view.container
      .querySelector("[data-slot=chat-avatar]")
      ?.getAttribute("data-state"),
    "responding"
  )
})

test("Gaze uses explicit slow animation without changing identity and stops for reduced motion", () => {
  const view = render(<ChatAvatar seed="Ada" state="idle" />)
  const still = gazeSvg(view.container)
  assert.match(still, /animation-none/)
  view.rerender(<ChatAvatar seed="Ada" state="working" />)
  const active = gazeSvg(view.container)
  assert.match(active, /animation-slow-/)
  assert.equal(
    active.match(/id="shape-([^"]+)/)?.[1],
    still.match(/id="shape-([^"]+)/)?.[1]
  )
  assert.equal(
    active.match(/id="eyes-([^"]+)/)?.[1],
    still.match(/id="eyes-([^"]+)/)?.[1]
  )
  act(() => setAvatarReducedMotion(true))
  assert.match(gazeSvg(view.container), /animation-none/)
  act(() => setAvatarReducedMotion(false))
  view.rerender(<ChatAvatar seed="Ada" state="responding" />)
  assert.match(gazeSvg(view.container), /animation-slowest-/)
})

test("a touch press stands in for hover and survives the touch's own pointerleave", () => {
  const view = render(
    <button>
      <ChatAvatar seed={seed} interactive />
    </button>
  )
  const button = view.getByRole("button")
  const svg = () => view.container.querySelector("svg")
  fireEvent.pointerDown(button, { pointerType: "touch" })
  assert.equal(svg()?.getAttribute("data-state"), "curious")
  fireEvent.pointerUp(button, { pointerType: "touch" })
  fireEvent.pointerLeave(button, { pointerType: "touch" })
  assert.equal(svg()?.getAttribute("data-state"), "happy")
  fireEvent.pointerDown(button, { pointerType: "touch" })
  fireEvent.pointerCancel(button, { pointerType: "touch" })
  assert.equal(svg()?.getAttribute("data-state"), "idle")
})

test("interactive identities respond to their control's hover and keyboard focus", () => {
  const view = render(
    <button>
      <ChatAvatar seed={seed} interactive />
    </button>
  )
  fireEvent.pointerEnter(view.getByRole("button"))
  assert.equal(
    view.container.querySelector("svg")?.getAttribute("data-state"),
    "curious"
  )
  fireEvent.focusIn(view.getByRole("button"))
  assert.equal(
    view.container.querySelector("svg")?.getAttribute("data-state"),
    "listening"
  )
  fireEvent.keyDown(view.getByRole("button"), { key: "Enter" })
  assert.equal(
    view.container.querySelector("svg")?.getAttribute("data-state"),
    "happy"
  )
  view.rerender(
    <button>
      <ChatAvatar seed={seed} state="working" interactive />
    </button>
  )
  fireEvent.pointerEnter(view.getByRole("button"))
  assert.equal(
    view.container.querySelector("svg")?.getAttribute("data-state"),
    "working"
  )
})

test("motion personality is stable for one teammate and differs between teammates sharing a shape", () => {
  const view = render(
    <div>
      <ChatAvatar seed={seed} identity="scout" state="working" />
      <ChatAvatar seed={seed} identity="scout" state="working" />
      <ChatAvatar seed={seed} identity="quill" state="working" />
    </div>
  )
  act(() => advanceAvatarFrames(0, 900))
  const transforms = [...view.container.querySelectorAll("svg")].map((svg) =>
    svg
      .querySelector("g:has(> path[fill='currentColor'])")
      ?.getAttribute("transform")
  )
  assert.equal(transforms[0], transforms[1])
  assert.notEqual(transforms[0], transforms[2])
})

test("groups show the actual active member even beyond the first three or with duplicate seeds", () => {
  const view = render(
    <GroupChatAvatar
      seeds={[seed, seed, seed, "blob:leaf:9"]}
      states={["idle", "idle", "idle", "working"]}
    />
  )
  const avatars = [
    ...view.container.querySelectorAll("[data-slot=chat-avatar]"),
  ]
  assert.equal(avatars.length, 3)
  assert.equal(
    avatars.filter((avatar) => avatar.getAttribute("data-state") === "working")
      .length,
    1
  )
  assert.equal(
    view.container
      .querySelector("[data-state=working] svg")
      ?.getAttribute("data-shape"),
    "leaf"
  )
  assert.ok(view.getByText("+1"))
})

test("all identity colors get contrasting ink and compact motion stays bounded", () => {
  for (const color of botColors)
    assert.ok(["#111111", "#fafafa"].includes(avatarInk(color)))
  assert.equal(avatarInk("#111111"), "#fafafa")
  assert.equal(avatarInk("#fafafa"), "#111111")
  for (const shape of Object.keys(
    CHARACTER_GEOMETRY
  ) as (keyof typeof CHARACTER_GEOMETRY)[])
    assert.ok(avatarScale(shape) <= 1.13)
  for (const state of [
    "thinking",
    "working",
    "listening",
    "happy",
    "idle",
  ] as const)
    for (let time = 0; time < 10; time += 0.1) {
      const target = avatarBodyTargets(state, time, time)
      assert.ok(Math.abs(target.y) <= 5 && Math.abs(target.rotation) <= 5)
    }
  assert.equal(avatarBodyTargets("happy", 2, 2).y < 1e-9, true)
})
