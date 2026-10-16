import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { ComputerLoginCard } from "../components/chat-computer-login"

afterEach(cleanup)
const login = { service: "ESPN Fantasy", hostname: "fantasy.espn.com" }

test("opening the computer never submits an answer and resume submits once", async () => {
  let opened = 0
  const answers: string[] = []
  const view = render(
    <ComputerLoginCard
      login={login}
      busy={false}
      onOpen={() => {
        opened++
      }}
      onAnswer={(answer) => {
        answers.push(answer)
      }}
    />
  )
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Open sign-in" }))
  })
  assert.equal(opened, 1)
  assert.deepEqual(answers, [])
  assert.equal(view.queryByRole("textbox"), null)
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "I’m signed in" }))
    fireEvent.click(view.getByRole("button", { name: "I’m signed in" }))
  })
  assert.deepEqual(answers, ["I'm signed in"])
})

test("rejected continuation can be retried and cancel sends a scoped cancellation", async () => {
  let attempts = 0
  const answers: string[] = []
  const view = render(
    <ComputerLoginCard
      login={login}
      busy={false}
      onOpen={() => {}}
      onAnswer={(answer) => {
        answers.push(answer)
        return ++attempts > 1
      }}
    />
  )
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "I’m signed in" }))
  })
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Cancel sign-in" }))
  })
  assert.deepEqual(answers, ["I'm signed in", "Cancel sign-in"])
})

test("sign-in controls are unavailable while the agent is running", () => {
  const view = render(
    <ComputerLoginCard
      login={login}
      busy
      onOpen={() => assert.fail()}
      onAnswer={() => assert.fail()}
    />
  )
  for (const button of view.getAllByRole("button"))
    assert.equal((button as HTMLButtonElement).disabled, true)
})
