import "./helpers/dom"
import "./helpers/css.mjs"
import assert from "node:assert/strict"
import { afterEach, beforeEach, test } from "node:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
const { RoleWalkthroughPlayer } =
  await import("../components/role-walkthrough-player")

function setPhoneWidth(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (media: string): MediaQueryList => ({
      matches,
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    }),
  })
}

beforeEach(() => setPhoneWidth(false))
afterEach(cleanup)

test("a walkthrough creates no video source until the person plays it", () => {
  const view = render(
    <RoleWalkthroughPlayer slug="sales-outbound" title="Sales walkthrough" />
  )
  assert.equal(view.container.querySelector("video"), null)
  assert.ok(!view.container.innerHTML.includes(".mp4"))
  fireEvent.click(view.getByRole("button", { name: /Play sales walkthrough/ }))
  const video = view.container.querySelector("video")!
  assert.equal(
    video.getAttribute("src"),
    "/marketing/walkthroughs/sales-outbound-16x9.mp4"
  )
  assert.equal(video.preload, "none")
  assert.equal(video.muted, true)
  assert.equal(video.controls, true)
  assert.equal(video.playsInline, true)
  assert.equal(document.activeElement, video)
  assert.ok(video.querySelector('track[kind="captions"]'))
})

test("a phone selects the separately composed portrait walkthrough", () => {
  setPhoneWidth(true)
  const view = render(
    <RoleWalkthroughPlayer slug="support-triage" title="Support walkthrough" />
  )
  fireEvent.click(
    view.getByRole("button", { name: /Play support walkthrough/ })
  )
  assert.equal(
    view.container.querySelector("video")?.getAttribute("src"),
    "/marketing/walkthroughs/support-triage-9x16.mp4"
  )
})

test("a failed download explains the problem and offers another play attempt", () => {
  const view = render(
    <RoleWalkthroughPlayer slug="sales-outbound" title="Sales walkthrough" />
  )
  fireEvent.click(view.getByRole("button", { name: /Play sales walkthrough/ }))
  fireEvent.error(view.container.querySelector("video")!)
  assert.match(view.getByRole("alert").textContent!, /Couldn't load the video/)
  assert.equal(view.container.querySelector("video"), null)
  fireEvent.click(view.getByRole("button", { name: /Play sales walkthrough/ }))
  assert.equal(view.queryByRole("alert"), null)
  assert.ok(view.container.querySelector("video"))
})
