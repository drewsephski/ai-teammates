import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { act, cleanup, fireEvent, render } from "@testing-library/react"

const { ChatMessageActions } =
  await import("../components/chat-message-actions")

afterEach(cleanup)

test("copying a reply writes its Markdown to the clipboard and confirms it", async () => {
  const written: string[] = []
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void written.push(text) },
  })

  const view = render(<ChatMessageActions text={"**Done.**\n\n- One"} />)
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Copy reply" }))
  })

  assert.deepEqual(written, ["**Done.**\n\n- One"])
  assert.ok(view.getByRole("button", { name: "Copied" }))
})
