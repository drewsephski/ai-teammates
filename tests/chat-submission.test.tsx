import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  usePromptInputAttachments,
  usePromptInputController,
} from "../components/ai-elements/prompt-input"
import { ChatQuestion } from "../components/chat-question"
import type { ChatUIMessage } from "../lib/sandbox-tools"

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

for (const provider of [false, true]) {
  function composer(
    onSubmit: React.ComponentProps<typeof PromptInput>["onSubmit"]
  ) {
    const content = (
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea aria-label="Message" />
        <button type="submit">Send</button>
      </PromptInput>
    )
    return render(
      provider ? <PromptInputProvider>{content}</PromptInputProvider> : content
    )
  }

  for (const failure of ["throw", "reject", "false"] as const) {
    test(`${provider ? "provider" : "local"} composer preserves drafts on ${failure} and accepts a retry`, async () => {
      let attempts = 0
      const view = composer(() => {
        attempts += 1
        if (attempts > 1) return true
        if (failure === "throw") throw new Error("Upgrade required")
        if (failure === "reject")
          return Promise.reject(new Error("Unavailable"))
        return false
      })
      const input = view.getByRole("textbox") as HTMLTextAreaElement
      fireEvent.input(input, { target: { value: "Keep this draft" } })
      await act(async () =>
        fireEvent.click(view.getByRole("button", { name: "Send" }))
      )
      assert.equal(input.value, "Keep this draft")
      await act(async () =>
        fireEvent.click(view.getByRole("button", { name: "Send" }))
      )
      assert.equal(attempts, 2)
      assert.equal(input.value, "")
    })
  }

  test(`${provider ? "provider" : "local"} composer preserves edits and blocks duplicate pending submissions`, async () => {
    const pending = deferred<boolean>()
    let attempts = 0
    const view = composer(() => {
      attempts += 1
      return pending.promise
    })
    const input = view.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.input(input, { target: { value: "Original" } })
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Send" }))
    )
    fireEvent.input(input, { target: { value: "Changed" } })
    fireEvent.input(input, { target: { value: "Original" } })
    await act(async () =>
      fireEvent.click(view.getByRole("button", { name: "Send" }))
    )
    assert.equal(attempts, 1)
    await act(async () => pending.resolve(true))
    assert.equal(input.value, "Original")
  })
}

test("provider edits outside the form survive pending acceptance", async () => {
  const pending = deferred<boolean>()
  function ExternalEditor() {
    const controller = usePromptInputController()
    return (
      <button onClick={() => controller.textInput.setInput("New draft")}>
        Edit draft
      </button>
    )
  }
  const view = render(
    <PromptInputProvider initialInput="Original">
      <ExternalEditor />
      <PromptInput onSubmit={() => pending.promise}>
        <PromptInputTextarea aria-label="Message" />
        <button type="submit">Send</button>
      </PromptInput>
    </PromptInputProvider>
  )
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Send" }))
  )
  fireEvent.click(view.getByRole("button", { name: "Edit draft" }))
  await act(async () => pending.resolve(true))
  assert.equal(
    (view.getByRole("textbox") as HTMLTextAreaElement).value,
    "New draft"
  )
})

for (const provider of [false, true]) {
  test(`${provider ? "provider" : "local"} composer retains attachments on rejection and only removes accepted files`, async () => {
    const pending = deferred<boolean>()
    let accepted = false
    function Files() {
      const attachments = usePromptInputAttachments()
      return (
        <output>
          {attachments.files.map((file) => file.filename).join(",")}
        </output>
      )
    }
    const content = (
      <PromptInput
        onSubmit={() => (accepted ? pending.promise : false)}
        multiple
      >
        <Files />
        <PromptInputTextarea />
        <button type="submit">Send</button>
      </PromptInput>
    )
    const view = render(
      provider ? <PromptInputProvider>{content}</PromptInputProvider> : content
    )
    // Use stable non-blob URLs; blob conversion is a separate browser API.
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = (blob) => `https://example.com/${(blob as File).name}`
    URL.revokeObjectURL = () => {}
    try {
      const upload = view.getByLabelText("Upload files")
      fireEvent.change(upload, {
        target: { files: [new File(["one"], "one.txt")] },
      })
      await act(async () =>
        fireEvent.click(view.getByRole("button", { name: "Send" }))
      )
      assert.equal(view.getByRole("status").textContent, "one.txt")
      accepted = true
      await act(async () =>
        fireEvent.click(view.getByRole("button", { name: "Send" }))
      )
      fireEvent.change(upload, {
        target: { files: [new File(["two"], "two.txt")] },
      })
      await act(async () => pending.resolve(true))
      assert.equal(view.getByRole("status").textContent, "two.txt")
    } finally {
      cleanup()
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })
}

const question: Extract<
  ChatUIMessage["parts"][number],
  { type: "tool-askUser" }
> = {
  type: "tool-askUser",
  toolCallId: "question",
  state: "output-available",
  input: { question: "Which direction?", options: ["First", "Second"] },
  output: { question: "Which direction?", options: ["First", "Second"] },
}

for (const action of ["choice", "dismiss", "custom"] as const) {
  for (const failure of ["false", "throw", "reject"] as const) {
    test(`question ${action} unlocks after ${failure}, accepts retry, and prevents duplicate answers`, async () => {
      let attempts = 0
      const submit = () => {
        attempts += 1
        if (attempts > 1) return true
        if (failure === "throw") throw new Error("Blocked")
        if (failure === "reject") return Promise.reject(new Error("Blocked"))
        return false
      }
      const view = render(
        <ChatQuestion
          part={question}
          active
          busy={false}
          onAnswer={submit}
          onDismiss={submit}
        />
      )
      const trigger = () => {
        if (action === "choice")
          fireEvent.click(view.getByRole("radio", { name: /First/ }))
        else if (action === "dismiss")
          fireEvent.click(
            view.getByRole("button", { name: "Dismiss question" })
          )
        else {
          const input = view.getByRole("textbox", { name: "Your answer" })
          fireEvent.input(input, { target: { value: "My answer" } })
          fireEvent.keyDown(input, { key: "Enter" })
        }
      }
      await act(async () => trigger())
      assert.equal(attempts, 1)
      await act(async () => trigger())
      assert.equal(attempts, 2)
      await act(async () => trigger())
      assert.equal(attempts, 2)
    })
  }
}

test("question disables choices while parent acceptance is pending", async () => {
  const pending = deferred<boolean>()
  let attempts = 0
  const view = render(
    <ChatQuestion
      part={question}
      active
      busy={false}
      onAnswer={() => {
        attempts += 1
        return pending.promise
      }}
      onDismiss={() => true}
    />
  )
  const choice = view.getByRole("radio", { name: /First/ }) as HTMLInputElement
  await act(async () => fireEvent.click(choice))
  assert.equal(choice.disabled, true)
  fireEvent.click(choice)
  assert.equal(attempts, 1)
  await act(async () => pending.resolve(false))
  assert.equal(choice.disabled, false)
})
