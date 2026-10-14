import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { WorkspaceBots } from "../components/workspace-bots"
import type { WorkspaceBot } from "../lib/workspace-activity"

afterEach(cleanup)

const bots: WorkspaceBot[] = [
  {
    id: "scout",
    name: "Scout",
    job: "Research assistant",
    avatar: "test",
    chatId: "research",
    activity: "working",
  },
  {
    id: "quill",
    name: "Quill",
    job: "Writing editor",
    avatar: "test",
    chatId: "writing",
    activity: "ready",
  },
]

test("workspace lists actual bots and running filter keeps chat navigation intact", () => {
  const view = render(<WorkspaceBots bots={bots} />)
  assert.equal(view.getAllByRole("link").length, 2)
  fireEvent.click(view.getByRole("button", { name: "Running 1" }))
  assert.equal(view.getAllByRole("link").length, 1)
  assert.equal(
    view.getByRole("link", { name: "Open Scout" }).getAttribute("href"),
    "/chats/research"
  )
  assert.equal(view.queryByRole("link", { name: "Open Quill" }), null)
  fireEvent.click(view.getByRole("button", { name: "All bots" }))
  assert.ok(view.getByRole("link", { name: "Open Quill" }))
})

test("activity failure is not presented as an idle workspace", () => {
  const view = render(
    <WorkspaceBots bots={[{ ...bots[0], activity: "unknown" }]} />
  )
  fireEvent.click(view.getByRole("button", { name: "Running" }))
  assert.ok(view.getByText(/Bot activity is temporarily unavailable/))
  assert.equal(view.queryByText(/No bots are running/), null)
})
