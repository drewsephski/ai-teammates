import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { ApprovalCard } from "../components/approval-card"

afterEach(cleanup)

type Api = NonNullable<Parameters<typeof ApprovalCard>[0]["api"]>

const png = "data:image/png;base64,iVBORw0KGgo="

function setup(
  detail: Record<string, unknown>,
  decisions: string[] = [],
  props: { toolkit?: string } = {}
) {
  const api = {
    getApproval: async () => ({
      state: "pending",
      summary: "Submit the roster",
      toolkit: "notion",
      expiresAt: new Date(),
      emailDraft: undefined,
      kind: "app",
      hostname: null,
      action: null,
      alwaysAllowed: true,
      preview: null,
      ...detail,
    }),
    decideApproval: async (_id: string, decision: string) => {
      decisions.push(decision)
      return { ok: true, state: "approved", woke: true }
    },
    actOnEmailDraft: async () => {
      throw new Error("unused")
    },
  } as unknown as Api
  return render(
    <ApprovalCard
      approvalId="appr_1"
      summary="Submit the roster"
      api={api}
      {...props}
    />
  )
}

test("an app approval offers Approve, Always allow and Decline", async () => {
  const view = setup({})
  await waitFor(() => view.getByRole("button", { name: "Approve" }))
  assert.ok(view.getByRole("button", { name: "Always allow" }))
  assert.ok(view.getByRole("button", { name: "Decline" }))
})

test("Always allow is hidden when it would act as a plain approval", async () => {
  const view = setup({ alwaysAllowed: false })
  await waitFor(() => view.getByRole("button", { name: "Approve" }))
  assert.equal(view.queryByRole("button", { name: "Always allow" }), null)
})

test("a computer approval names the site and never offers Always allow", async () => {
  const view = setup(
    {
      kind: "computer",
      toolkit: "computer",
      hostname: "fantasy.espn.com",
      action: "submit",
      // Even if the server said it could, a computer step is one-off
      alwaysAllowed: true,
    },
    [],
    { toolkit: "computer" }
  )
  await waitFor(() => view.getByRole("button", { name: "Approve" }))
  assert.equal(view.queryByRole("button", { name: "Always allow" }), null)
  assert.ok(view.getByRole("button", { name: "Decline" }))
  assert.ok(view.getByText("Needs your approval · Submit · fantasy.espn.com"))
})

test("a computer approval shows the screenshot with the summary as its alt text", async () => {
  const view = setup({
    kind: "computer",
    hostname: "fantasy.espn.com",
    action: "submit",
    preview: png,
  })
  const image = await waitFor(() => {
    const found = view.container.querySelector("img")
    assert.ok(found)
    return found
  })
  assert.equal(image.getAttribute("src"), png)
  assert.equal(image.getAttribute("alt"), "Submit the roster")
  assert.ok(view.getByRole("button", { name: "Enlarge the screenshot" }))
})

test("a preview that is not an image data URL is never drawn", async () => {
  const view = setup({
    kind: "computer",
    hostname: "example.com",
    preview: "https://evil.example/pixel.png",
  })
  await waitFor(() => view.getByRole("button", { name: "Approve" }))
  assert.equal(view.container.querySelector("img"), null)
})

test("deciding sends the choice and settles the card", async () => {
  const decisions: string[] = []
  const view = setup({ kind: "computer", hostname: "example.com" }, decisions)
  fireEvent.click(await view.findByRole("button", { name: "Approve" }))
  await waitFor(() => view.getByText("Approved"))
  assert.deepEqual(decisions, ["approve"])
})
