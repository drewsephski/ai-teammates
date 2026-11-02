// Live check that a computer from the krafty-desktop template opens ESPN
// fantasy football the way a chat turn does: create and pause, resume, open the
// page with openOnScreen (which waits for it), and read it through the screen
// reader. Opt-in, not part of `pnpm test`:
//
//   pnpm exec tsx --env-file=.env.local scripts/verify-espn-browser.ts [dir]
//
// Spends a few minutes of E2B Hobby time on one throwaway computer, deleted at
// the end. No model calls and no database rows: the computer has no owner.
// Screenshots and the report land in the directory (default
// .artifacts/espn-browser), so a blank or unreadable page can be looked at.
import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { mock } from "node:test"
import { Sandbox, type SandboxOpts } from "@e2b/desktop"

import {
  createAccountSandbox,
  deleteSandbox,
  isLegacyTemplate,
  sandboxTemplateName,
} from "@/lib/e2b"
import { createSandboxTools } from "@/lib/sandbox-tools"
import { espnFantasyFootballUrl } from "@/lib/fantasy-football"

const directory = process.argv[2] ?? ".artifacts/espn-browser"
const originalCreate: (
  this: typeof Sandbox,
  template: string,
  options: SandboxOpts
) => Promise<Sandbox> = Sandbox.create
mock.method(
  Sandbox,
  "create",
  function (this: typeof Sandbox, template: string, options: SandboxOpts) {
    return originalCreate.call(this, template, {
      ...options,
      metadata: { ...options.metadata, app: "ai-teammates-verification" },
    })
  }
)
await mkdir(directory, { recursive: true })

function isStream<T>(value: T | AsyncIterable<T>): value is AsyncIterable<T> {
  return (
    typeof value === "object" && value !== null && Symbol.asyncIterator in value
  )
}
async function result<T>(
  value: T | AsyncIterable<T> | PromiseLike<T | AsyncIterable<T>>
): Promise<T> {
  const output = await value
  if (isStream(output)) throw new Error("Expected a completed tool result")
  return output
}

const report: Record<string, unknown> = { checkedAt: new Date().toISOString() }
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  report[name] = { ok, detail }
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`, detail ?? "")
  if (!ok) failures.push(name)
}

const started = Date.now()
const sandboxId = await createAccountSandbox(`verify-${randomUUID()}`)
report.sandboxId = sandboxId
console.log(`Computer ${sandboxId} created, hardened and paused`)

const tools = createSandboxTools(() => sandboxId, {
  gesture: async () => ({}),
  shell: async () => ({}),
  complete: async () => {},
})
const options = { toolCallId: "verification", messages: [], context: {} }

async function screenshot(label: string) {
  const shot = await result(tools.viewScreen.execute!({}, options))
  await writeFile(
    `${directory}/${label}.png`,
    Buffer.from(shot.base64, "base64")
  )
  return shot
}

try {
  // The computer must not look like one from the stock template, or
  // ensureAccountComputer would replace it on every turn
  const template = await sandboxTemplateName(sandboxId)
  check("templateName", !!template && !isLegacyTemplate(template), template)

  // The turn's first call resumes the paused computer, like production, and
  // waits for the page instead of returning a loading screen
  const t0 = Date.now()
  const front = await result(
    tools.openOnScreen.execute!({ url: espnFantasyFootballUrl }, options)
  )
  const frontMs = Date.now() - t0
  report.front = { ...front, ms: frontMs }
  await screenshot("front")
  check(
    "frontPageLoaded",
    front.status === "loaded" &&
      /fantasy football/i.test(front.text ?? "") &&
      !/page not found/i.test(front.text ?? ""),
    {
      status: front.status,
      restarted: front.restarted,
      ms: frontMs,
      head: front.text?.slice(0, 200),
    }
  )
  const shot = await screenshot("front-again")
  check("screenshotNotBlank", !shot.blank, { blank: shot.blank })

  // A team page signed out: the bot is told to ask for sign-in, not a 404
  const t1 = Date.now()
  const team = await result(
    tools.openOnScreen.execute!(
      {
        url: "https://fantasy.espn.com/football/team?leagueId=1&teamId=1&seasonId=2026",
      },
      options
    )
  )
  report.team = { ...team, ms: Date.now() - t1 }
  await screenshot("team")
  check(
    "teamPageAsksForSignIn",
    team.status === "loaded" &&
      /log ?in/i.test(team.text ?? "") &&
      !/page not found/i.test(team.text ?? ""),
    {
      status: team.status,
      ms: Date.now() - t1,
      head: team.text?.slice(0, 200),
    }
  )

  // The window reads without waiting again
  const read = await result(tools.readScreen.execute!({}, options))
  check("readScreen", read.status === "read", {
    status: read.status,
    app: read.status === "read" ? read.app : undefined,
  })
} finally {
  report.seconds = Math.round((Date.now() - started) / 1000)
  report.failures = failures
  await deleteSandbox(sandboxId).catch((error: unknown) =>
    console.error(`Couldn't delete ${sandboxId}`, error)
  )
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2))
  console.log(
    `${failures.length ? `Failed: ${failures.join(", ")}` : "All checks passed"} in ${report.seconds}s. Report saved to ${directory}/report.json`
  )
}
process.exit(failures.length ? 1 : 0)
