import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useState } from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { TimePicker } from "../components/ui/time-picker"

Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
})
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: clearTimeout,
})
Object.defineProperty(globalThis, "getComputedStyle", {
  configurable: true,
  value: window.getComputedStyle.bind(window),
})
afterEach(cleanup)

test("time picker changes hours and minutes without submitting its form", async () => {
  let submits = 0
  function Form() {
    const [value, setValue] = useState("08:07")
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submits++
        }}
      >
        <TimePicker value={value} onChange={setValue} />
      </form>
    )
  }
  const view = render(<Form />)
  assert.equal(view.container.querySelector('input[type="time"]'), null)
  fireEvent.click(view.getByRole("button", { name: "Time: 08:07" }))
  fireEvent.click(await view.findByRole("combobox", { name: "Hour" }))
  const hour = await view.findByRole("option", { name: "23" })
  fireEvent.pointerDown(hour)
  fireEvent.click(hour)
  fireEvent.click(view.getByRole("combobox", { name: "Minute" }))
  const minute = await view.findByRole("option", { name: "59" })
  fireEvent.pointerDown(minute)
  fireEvent.click(minute)
  assert.ok(view.getByRole("button", { name: "Time: 23:59" }))
  assert.equal(submits, 0)
})
