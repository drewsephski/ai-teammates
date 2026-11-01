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

test("a reply shows what it used of the allowance, net of any credit", () => {
  const usage = { spent: 25_400, credited: 0, chatgpt: false, failed: false }
  const view = render(<ChatMessageActions text="Done." usage={usage} />)
  const spend = view.container.querySelector('[data-slot="chat-turn-spend"]')
  assert.match(
    spend?.textContent ?? "",
    /^2\.5¢ used from your krafty ai allowance/
  )
  cleanup()

  // A reply with no text to copy still shows its spend
  const toolOnly = render(<ChatMessageActions usage={usage} />)
  assert.equal(toolOnly.queryByRole("button", { name: "Copy reply" }), null)
  assert.ok(toolOnly.container.querySelector('[data-slot="chat-turn-spend"]'))
  cleanup()

  // Given back in full: nothing to show, and nothing at all without text
  const credited = render(
    <ChatMessageActions usage={{ ...usage, credited: 25_400 }} />
  )
  assert.equal(credited.container.childElementCount, 0)
})
