import "./helpers/avatar-motion"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { ApprovalRules } from "../components/activity/approval-rules"

afterEach(cleanup)

const rule = {
  botId: "bot_1",
  botName: "Alex",
  toolSlug: "NOTION_UPDATE_PAGE",
  createdAt: new Date(Date.now() - 3 * 86_400_000),
}

test("an empty list says so", () => {
  const view = render(<ApprovalRules rules={[]} revoke={async () => {}} />)
  assert.ok(view.getByText(/No actions are always allowed/))
})

test("a rule reads as a person would say it, and Remove asks first", async () => {
  const revoked: unknown[] = []
  const view = render(
    <ApprovalRules
      rules={[rule]}
      revoke={async (input) => void revoked.push(input)}
    />
  )
  assert.ok(view.getByText("Notion: update page"))
  assert.ok(view.getByText(/Alex · added 3 days ago/))
  fireEvent.click(
    view.getByRole("button", {
      name: "Remove always allow for Notion: update page, Alex",
    })
  )
  assert.deepEqual(revoked, [])
  fireEvent.click(await view.findByRole("button", { name: "Remove rule" }))
  await waitFor(() =>
    assert.deepEqual(revoked, [
      { botId: "bot_1", toolSlug: "NOTION_UPDATE_PAGE" },
    ])
  )
})
