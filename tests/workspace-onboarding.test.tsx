import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { WorkspaceOnboardingFlow } from "../components/workspace-onboarding-flow"
import { botPresets, type BotPresetId } from "../lib/bot-presets"

// Characters remain still under reduced motion; tests exercise the actual UI.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }),
})
Object.defineProperty(globalThis, "IntersectionObserver", {
  configurable: true,
  value: class {
    observe() {}
    disconnect() {}
  },
})
afterEach(cleanup)

test("every starting goal previews the correct role and creates only on explicit confirmation", () => {
  const labels = [
    "Research a market, deliver a brief",
    "Investigate and fix a real bug",
    "Take a launch from brief to publish",
    "Build hands-on training",
    "Coordinate a project launch",
    "Turn live data into decisions",
  ]
  for (const [index, preset] of botPresets.entries()) {
    const created: (BotPresetId | undefined)[] = []
    const view = render(
      <WorkspaceOnboardingFlow
        pending={false}
        onSkip={() => {}}
        onCreate={(id) => created.push(id)}
      />
    )
    fireEvent.click(
      view.getByRole("button", { name: new RegExp(labels[index]) })
    )
    const heading = view.getByRole("heading", { level: 1 })
    assert.equal(heading.textContent, `Meet your ${preset.job.toLowerCase()}.`)
    assert.equal(document.activeElement, heading)
    assert.ok(view.getByText(`“${preset.prompt}”`))
    assert.deepEqual(created, [])
    fireEvent.click(view.getByRole("button", { name: "Meet my teammate" }))
    assert.deepEqual(created, [preset.id])
    fireEvent.click(view.getByRole("button", { name: "Back" }))
    assert.equal(
      document.activeElement,
      view.getByRole("heading", { level: 1 })
    )
    assert.ok(view.getByRole("button", { name: new RegExp(labels[index]) }))
    view.unmount()
  }
})

test("custom setup and role deep links preserve their intended starting point", () => {
  const created: (BotPresetId | undefined)[] = []
  const view = render(
    <WorkspaceOnboardingFlow
      pending={false}
      onSkip={() => {}}
      onCreate={(id) => created.push(id)}
    />
  )
  fireEvent.click(
    view.getByRole("button", { name: "I have something else in mind" })
  )
  assert.ok(view.getByRole("heading", { name: "A teammate, made for you." }))
  fireEvent.click(view.getByRole("button", { name: "Meet my teammate" }))
  assert.deepEqual([...created], [undefined])
  view.unmount()
  const linked = render(
    <WorkspaceOnboardingFlow
      initialPresetId="writing"
      pending={false}
      onSkip={() => {}}
      onCreate={(id) => created.push(id)}
    />
  )
  assert.ok(linked.getByRole("heading", { name: "Meet your writing editor." }))
  fireEvent.click(linked.getByRole("button", { name: "Meet my teammate" }))
  assert.deepEqual(created, [undefined, "writing"])
})

test("skip is available at each step and submission disables navigation until it settles", () => {
  let skips = 0
  let creates = 0
  const props = {
    initialPresetId: "research" as const,
    onSkip: () => skips++,
    onCreate: () => creates++,
  }
  const view = render(<WorkspaceOnboardingFlow {...props} pending={false} />)
  fireEvent.click(view.getByRole("button", { name: "Skip for now" }))
  assert.equal(skips, 1)
  view.rerender(<WorkspaceOnboardingFlow {...props} pending />)
  for (const name of ["Skip for now", "Back", "Opening your conversation…"]) {
    const button = view.getByRole("button", { name }) as HTMLButtonElement
    assert.equal(button.disabled, true)
    fireEvent.click(button)
  }
  assert.equal(skips, 1)
  assert.equal(creates, 0)
  view.rerender(<WorkspaceOnboardingFlow {...props} pending={false} />)
  fireEvent.click(view.getByRole("button", { name: "Back" }))
  fireEvent.click(view.getByRole("button", { name: "Skip for now" }))
  assert.equal(skips, 2)
  assert.ok(view.getByRole("button", { name: /Research a market/ }))
})

test("authentication is offered for the selected workflow without starting work or creating a teammate", () => {
  let created = 0
  const searched: string[] = []
  const view = render(
    <WorkspaceOnboardingFlow
      pending={false}
      onSkip={() => {}}
      onCreate={() => created++}
      renderConnections={(id) => (
        <div>
          {botPresets
            .find((role) => role.id === id)
            ?.suggestedApps.map((app) => (
              <button key={app} onClick={() => searched.push(app)}>
                Connect {app}
              </button>
            ))}
          <button onClick={() => searched.push("any")}>Find another app</button>
        </div>
      )}
    />
  )
  fireEvent.click(
    view.getByRole("button", { name: /Investigate and fix a real bug/ })
  )
  assert.ok(view.getByRole("region", { name: "Connect your services" }))
  fireEvent.click(view.getByRole("button", { name: "Connect GitHub" }))
  fireEvent.click(view.getByRole("button", { name: "Find another app" }))
  assert.deepEqual(searched, ["GitHub", "any"])
  assert.equal(created, 0)
  assert.ok(view.getByText(/sign in yourself in Desktop/))
  assert.ok(view.getByText(/Cloud computers and persistent files.*paid plans/))
})

test("advanced presets preserve bounded configuration and carry authentication and action guidance into the real bot", () => {
  for (const preset of botPresets) {
    assert.ok(preset.instructions.length <= 4000)
    assert.match(preset.instructions, /end-to-end work/)
    assert.match(preset.instructions, /connected-app APIs/)
    assert.match(preset.instructions, /sign in themselves in the live Desktop/)
    assert.match(
      preset.instructions,
      /A connection grants access, not permission/
    )
    assert.match(preset.prompt, /connect|sign in/)
    assert.ok(preset.suggestedApps.length > 0)
  }
})
