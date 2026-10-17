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

test("each blocker has its own wording and answers the options the server wrote", async () => {
  const cases = [
    {
      reason: "verification" as const,
      title: "Finish verification on ESPN Fantasy",
      done: "I’m done",
      answer: "I'm done",
      cancel: "Cancel",
    },
    {
      reason: "captcha" as const,
      title: "Complete the check on ESPN Fantasy",
      done: "I’m done",
      answer: "I'm done",
      cancel: "Cancel",
    },
    {
      reason: "payment" as const,
      title: "Complete the payment on ESPN Fantasy",
      done: "I’m done",
      answer: "I'm done",
      cancel: "Cancel",
    },
    {
      reason: "sign-in" as const,
      title: "Sign in to ESPN Fantasy",
      done: "I’m signed in",
      answer: "I'm signed in",
      cancel: "Cancel sign-in",
    },
  ]
  for (const item of cases) {
    const answers: string[] = []
    const view = render(
      <ComputerLoginCard
        login={{ ...login, reason: item.reason }}
        busy={false}
        onOpen={() => {}}
        onAnswer={(answer) => {
          answers.push(answer)
        }}
      />
    )
    assert.ok(view.getByText(item.title))
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: item.done }))
    })
    assert.deepEqual(answers, [item.answer])
    view.unmount()
    const second = render(
      <ComputerLoginCard
        login={{ ...login, reason: item.reason }}
        busy={false}
        onOpen={() => {}}
        onAnswer={(answer) => {
          answers.push(answer)
        }}
      />
    )
    await act(async () => {
      fireEvent.click(second.getByRole("button", { name: item.cancel }))
    })
    assert.equal(answers[1], item.cancel)
    second.unmount()
  }
})

test("only a sign-in says sign-in, and other blockers open Desktop", () => {
  const view = render(
    <ComputerLoginCard
      login={{ ...login, reason: "payment" }}
      busy={false}
      onOpen={() => {}}
      onAnswer={() => {}}
    />
  )
  assert.equal(view.queryByRole("button", { name: "Open sign-in" }), null)
  assert.ok(view.getByRole("button", { name: "Open Desktop" }))
  assert.match(
    view.getByText(/won’t enter payment details/).textContent ?? "",
    /payment/
  )
})
