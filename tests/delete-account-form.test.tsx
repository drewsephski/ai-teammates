import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { act, cleanup, fireEvent, render } from "@testing-library/react"

import { DeleteAccountForm } from "../components/delete-account-form"
import {
  accountDeletionSchema,
  appleDeletionOutcome,
} from "../lib/account-deletion-policy"

afterEach(cleanup)

test("Apple outcome survives the action boundary while legacy void results stay compatible", () => {
  for (const appleSignIn of ["revoked", "manual", "none"] as const)
    assert.equal(appleDeletionOutcome({ appleSignIn }), appleSignIn)
  for (const result of [undefined, null, {}, { appleSignIn: "invalid" }])
    assert.equal(appleDeletionOutcome(result), undefined)
})

test("manual Apple revocation instructions persist after account deletion", async () => {
  const view = render(
    <DeleteAccountForm
      deleteAction={async () => ({ ok: true, appleSignIn: "manual" })}
    />
  )
  fireEvent.change(view.getByRole("textbox"), {
    target: { value: "delete my account" },
  })
  await act(async () => fireEvent.submit(view.getByRole("form")))
  assert.match(
    view.getByRole("status").textContent ?? "",
    /could not be revoked automatically/
  )
  assert.equal(
    view.getByRole("link", { name: "account.apple.com" }).getAttribute("href"),
    "https://account.apple.com"
  )
  assert.equal(view.queryByRole("button"), null)
})

test("confirmation rejects missing, incorrect, or bodiless deletion requests", () => {
  for (const input of [
    undefined,
    null,
    {},
    { confirm: true },
    { confirm: "delete" },
  ])
    assert.equal(accountDeletionSchema.safeParse(input).success, false)
  assert.equal(
    accountDeletionSchema.safeParse({ confirm: "delete my account" }).success,
    true
  )
})

test("deletion requires explicit confirmation and shows truthful success including Apple fallback", async () => {
  let deletes = 0
  const view = render(
    <DeleteAccountForm
      deleteAction={async (input) => {
        assert.deepEqual(input, { confirm: "delete my account" })
        deletes++
        return { ok: true }
      }}
    />
  )
  await act(async () => fireEvent.submit(view.getByRole("form")))
  assert.equal(deletes, 0)
  assert.ok(view.getByText('Type "delete my account" to confirm.'))
  fireEvent.change(view.getByRole("textbox"), {
    target: { value: "delete my account" },
  })
  await act(async () => fireEvent.submit(view.getByRole("form")))
  assert.equal(deletes, 1)
  assert.ok(view.getByRole("status").textContent?.includes("Retained records"))
  assert.ok(
    view.getByRole("status").textContent?.includes("Sign in with Apple")
  )
  assert.equal(view.queryByRole("button"), null)
})

test("failed or interrupted deletion retains confirmation and permits retry without claiming success", async () => {
  let deletes = 0
  const view = render(
    <DeleteAccountForm
      deleteAction={async () => {
        deletes++
        if (deletes === 1)
          return {
            ok: false,
            message: "Subscription cancellation failed. Try again.",
          }
        throw new Error("Connection lost")
      }}
    />
  )
  fireEvent.change(view.getByRole("textbox"), {
    target: { value: "delete my account" },
  })
  await act(async () => fireEvent.submit(view.getByRole("form")))
  assert.equal(
    view.getByRole("alert").textContent,
    "Subscription cancellation failed. Try again."
  )
  assert.equal(
    (view.getByRole("textbox") as HTMLInputElement).value,
    "delete my account"
  )
  await act(async () => fireEvent.submit(view.getByRole("form")))
  assert.ok(view.getByRole("alert").textContent?.includes("could not confirm"))
  assert.equal(view.queryByRole("status"), null)
})

test("pending deletion disables the destructive action and confirmation input", async () => {
  let finish!: (value: { ok: true }) => void
  const result = new Promise<{ ok: true }>((resolve) => {
    finish = resolve
  })
  const view = render(<DeleteAccountForm deleteAction={() => result} />)
  fireEvent.change(view.getByRole("textbox"), {
    target: { value: "delete my account" },
  })
  await act(async () => fireEvent.submit(view.getByRole("form")))
  assert.equal((view.getByRole("button") as HTMLButtonElement).disabled, true)
  assert.equal((view.getByRole("textbox") as HTMLInputElement).disabled, true)
  await act(async () => finish({ ok: true }))
  assert.ok(view.getByRole("status"))
})
