import "./helpers/dom"
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react"

import { FantasyFootballModeDialog } from "../components/fantasy-football-mode-dialog"
import { FantasyFootballSettings } from "../components/fantasy-football-settings"
import { toast } from "../components/ui/toast"

Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  value: (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
})
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  value: clearTimeout,
})

type Api = NonNullable<Parameters<typeof FantasyFootballSettings>[0]["api"]>
type Settings = NonNullable<
  Awaited<ReturnType<Api["loadFantasyFootballSettings"]>>
>
const teamUrl =
  "https://fantasy.espn.com/football/team?leagueId=123456&teamId=2&seasonId=2026"
const settings: Settings = {
  botId: "coach",
  mode: "manual",
  teamUrl,
  teamName: "Dynasty Dogs",
  team: "Dynasty Dogs (League 123456, Team 2, 2026 season)",
  timezone: "America/Chicago",
  checkTime: "09:00",
  enabled: false,
  routineId: null,
  updatedAt: new Date(),
  nextRunAt: null,
  lastStatus: null,
  lastError: null,
}

function client(overrides: Partial<Api> = {}): Api {
  return {
    loadFantasyFootballSettings: async () => settings,
    updateFantasyFootballSettings: async () => settings,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  mock.restoreAll()
})

test("the ESPN creation dialog requires a deliberate mode choice and explains trade approvals", async () => {
  const choices: string[] = []
  const closed: boolean[] = []
  const view = render(
    <FantasyFootballModeDialog
      open
      pending={false}
      onSelect={(mode) => choices.push(mode)}
      onOpenChange={(open) => closed.push(open)}
    />
  )
  const manual = await view.findByRole("button", { name: /Manual approval/ })
  assert.match(
    view.getByRole("dialog").textContent!,
    /Trades, waivers, adds and drops always need approval/
  )
  assert.deepEqual(choices, [])
  fireEvent.click(manual)
  fireEvent.click(view.getByRole("button", { name: /Automatic/ }))
  assert.deepEqual(choices, ["manual", "autonomous"])
  fireEvent.click(view.getByRole("button", { name: "Cancel" }))
  await waitFor(() => assert.deepEqual(closed, [false]))
})

test("settings save the selected mode, team and schedule and allow revoking automatic changes", async () => {
  mock.method(toast, "add", () => "toast")
  const saves: unknown[] = []
  const api = client({
    updateFantasyFootballSettings: async (botId, values) => {
      saves.push({ botId, values })
      return { ...settings, ...(values as object) }
    },
  })
  const view = render(<FantasyFootballSettings botId="coach" api={api} />)
  const mode = await view.findByRole("switch", {
    name: "Automatic ESPN lineup changes",
  })
  assert.equal(mode.getAttribute("aria-checked"), "false")
  fireEvent.click(mode)
  fireEvent.click(view.getByRole("switch", { name: "Daily ESPN lineup check" }))
  fireEvent.change(view.getByLabelText("Daily check time"), {
    target: { value: "10:30" },
  })
  fireEvent.click(view.getByRole("button", { name: "Save lineup settings" }))
  await waitFor(() => assert.equal(saves.length, 1))
  assert.deepEqual(saves[0], {
    botId: "coach",
    values: {
      mode: "autonomous",
      teamUrl,
      enabled: true,
      timezone: "America/Chicago",
      checkTime: "10:30",
    },
  })
  await waitFor(() =>
    assert.equal(
      view
        .getByRole("button", { name: "Save lineup settings" })
        .getAttribute("aria-busy"),
      "false"
    )
  )
  fireEvent.click(mode)
  fireEvent.click(view.getByRole("button", { name: "Save lineup settings" }))
  await waitFor(() => assert.equal(saves.length, 2))
  assert.equal((saves[1] as { values: { mode: string } }).values.mode, "manual")
})

test("the saved team is named, and a pasted link shows what it points at before saving", async () => {
  const view = render(<FantasyFootballSettings botId="coach" api={client()} />)
  const input = await view.findByLabelText("ESPN team link")
  assert.match(
    view.getByText(/Saved team:/).textContent!,
    /Dynasty Dogs \(League 123456, Team 2, 2026 season\)/
  )
  fireEvent.change(input, {
    target: {
      value: "https://fantasy.espn.com/football/team?leagueId=99&teamId=7",
    },
  })
  await waitFor(() =>
    assert.match(view.getByText(/^Team:/).textContent!, /League 99, Team 7/)
  )
  // The name belonged to the saved team
  assert.doesNotMatch(view.getByText(/^Team:/).textContent!, /Dynasty/)
  view.rerender(
    <FantasyFootballSettings
      botId="fresh"
      api={client({
        loadFantasyFootballSettings: async () => ({
          ...settings,
          botId: "fresh",
          teamUrl: "",
          teamName: "",
          team: null,
        }),
      })}
    />
  )
  await view.findByText(/Ask your bot in chat to find it/)
  assert.equal(view.queryByText(/Saved team:/), null)
})

test("invalid ESPN team links stay in the form and never reach the server", async () => {
  let saves = 0
  const api = client({
    updateFantasyFootballSettings: async () => {
      saves++
      return settings
    },
  })
  const view = render(<FantasyFootballSettings botId="coach" api={api} />)
  const input = await view.findByLabelText("ESPN team link")
  fireEvent.change(input, { target: { value: "https://example.com/team" } })
  fireEvent.click(view.getByRole("button", { name: "Save lineup settings" }))
  assert.match(
    (await view.findByRole("alert")).textContent!,
    /Paste the link of your team page on fantasy.espn.com/
  )
  assert.equal(input.getAttribute("aria-invalid"), "true")
  assert.equal(saves, 0)
})

test("a failed load can retry and bots without fantasy settings show no controls", async () => {
  let attempts = 0
  const api = client({
    loadFantasyFootballSettings: async () => {
      if (++attempts === 1) throw new Error("Unavailable")
      return settings
    },
  })
  const view = render(<FantasyFootballSettings botId="coach" api={api} />)
  fireEvent.click(
    await view.findByRole("button", { name: "Retry lineup settings" })
  )
  await view.findByLabelText("ESPN team link")
  assert.equal(attempts, 2)
  view.rerender(
    <FantasyFootballSettings
      botId="custom"
      api={client({ loadFantasyFootballSettings: async () => null })}
    />
  )
  await waitFor(() => assert.equal(view.container.textContent, ""))
})

test("saving disables duplicate submissions, retains edits after failure, and Enter saves only the ESPN fields", async () => {
  const messages = mock.method(toast, "add", () => "toast")
  let rejectSave: (error: Error) => void = () => {}
  let saves = 0
  let profileSubmits = 0
  const api = client({
    updateFantasyFootballSettings: async () => {
      saves++
      return new Promise((_resolve, reject) => {
        rejectSave = reject
      })
    },
  })
  const view = render(
    <form
      onSubmit={(event) => {
        event.preventDefault()
        profileSubmits++
      }}
    >
      <FantasyFootballSettings botId="coach" api={api} />
    </form>
  )
  const input = await view.findByLabelText("Daily check time")
  fireEvent.change(input, { target: { value: "11:00" } })
  fireEvent.keyDown(input, { key: "Enter" })
  await waitFor(() => assert.equal(saves, 1))
  assert.equal(profileSubmits, 0)
  assert.ok(
    view
      .getByRole("button", { name: "Save lineup settings" })
      .hasAttribute("disabled")
  )
  assert.equal(
    view
      .getByRole("switch", { name: "Automatic ESPN lineup changes" })
      .getAttribute("aria-disabled"),
    "true"
  )
  fireEvent.click(view.getByRole("button", { name: "Save lineup settings" }))
  assert.equal(saves, 1)
  await act(async () => rejectSave(new Error("Unavailable")))
  await waitFor(() =>
    assert.equal(
      view
        .getByRole("button", { name: "Save lineup settings" })
        .getAttribute("aria-busy"),
      "false"
    )
  )
  assert.equal((input as HTMLInputElement).value, "11:00")
  assert.equal(messages.mock.calls.at(-1)?.arguments[0]?.type, "error")
})
