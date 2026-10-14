import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useRef } from "react"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { ChatFollowUps } from "../components/chat-follow-ups"
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
} from "../components/ai-elements/prompt-input"

afterEach(cleanup)

test("suggestions fill and focus the composer without sending; edits survive rejected submission", async () => {
  let submits = 0
  let selections = 0
  function Composer() {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    return (
      <PromptInputProvider>
        <ChatFollowUps
          suggestions={[
            {
              label: "Try five founders",
              prompt: "Test Krafty's launch with five founders.",
            },
          ]}
          inputRef={inputRef}
          onSelect={() => selections++}
        />
        <PromptInput
          onSubmit={() => {
            submits++
            return false
          }}
        >
          <PromptInputTextarea ref={inputRef} aria-label="Message" />
          <button type="submit">Send</button>
        </PromptInput>
      </PromptInputProvider>
    )
  }
  const view = render(<Composer />)
  const input = view.getByRole("textbox") as HTMLTextAreaElement
  fireEvent.click(view.getByRole("button", { name: "Try five founders" }))
  assert.equal(input.value, "Test Krafty's launch with five founders.")
  assert.equal(document.activeElement, input)
  assert.equal(submits, 0)
  assert.equal(selections, 1)
  assert.equal(
    view.queryByRole("group", { name: "Suggested follow-up prompts" }),
    null
  )
  fireEvent.input(input, { target: { value: "My edited prompt" } })
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  assert.equal(submits, 1)
  assert.equal(input.value, "My edited prompt")
  fireEvent.input(input, { target: { value: "" } })
  assert.ok(view.getByRole("button", { name: "Try five founders" }))
})

test("existing drafts and empty suggestions render no follow-up controls", () => {
  for (const initialInput of ["My draft", ""]) {
    const view = render(
      <PromptInputProvider initialInput={initialInput}>
        <ChatFollowUps
          suggestions={
            initialInput
              ? [{ label: "Another idea", prompt: "Do something else" }]
              : []
          }
          inputRef={{ current: null }}
        />
      </PromptInputProvider>
    )
    assert.equal(view.queryByRole("group"), null)
    view.unmount()
  }
})
