import "./helpers/dom"
import "./helpers/css.mjs"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ChatUIMessage } from "../lib/sandbox-tools"

const { ToolCall } = await import("../components/chat-tool-call")

afterEach(cleanup)

const input = { botId: "editor", prompt: "Who are you?" }

test("a completed teammate contribution shows its name and actual Markdown answer without opening details", () => {
  const part: ChatUIMessage["parts"][number] = {
    type: "tool-consultTeammate",
    toolCallId: "consult",
    state: "output-available",
    input,
    output: {
      botId: "editor",
      name: "Editor",
      answer: "I'm **Editor**, your writing teammate.\n\n- I edit drafts.",
    },
  }
  const view = render(<ToolCall part={part} />)
  assert.ok(view.getByText("Editor", { selector: "p" }))
  assert.ok(view.getByText("Editor", { selector: "strong" }))
  assert.ok(view.getByText("I edit drafts.", { selector: "li" }))
  assert.ok(view.container.querySelector('[data-slot="teammate-contribution"]'))
  assert.equal(view.queryByRole("button"), null)
  assert.equal(view.queryByText("Teammate contributed"), null)
  assert.equal(view.queryByText(input.botId), null)
  assert.equal(view.queryByText(input.prompt), null)
})

test("pending and failed consultations keep honest tool states without showing a contribution", () => {
  const pending: ChatUIMessage["parts"][number] = {
    type: "tool-consultTeammate",
    toolCallId: "consult",
    state: "input-available",
    input,
  }
  const view = render(<ToolCall part={pending} />)
  assert.ok(view.getByText("Consulting teammate"))
  assert.ok(view.getByText("Running"))
  assert.equal(
    view.container.querySelector('[data-slot="teammate-contribution"]'),
    null
  )
  view.rerender(
    <ToolCall
      part={{
        ...pending,
        state: "output-error",
        errorText: "Teammate unavailable",
      }}
    />
  )
  assert.ok(view.getByText("Failed"))
  fireEvent.click(view.getByRole("button"))
  assert.ok(view.getAllByText("Teammate unavailable").length)
  assert.equal(
    view.container.querySelector('[data-slot="teammate-contribution"]'),
    null
  )
})
