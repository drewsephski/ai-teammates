import assert from "node:assert/strict"
import test from "node:test"

import { createFantasyFootballTools } from "../lib/fantasy-football-tools"
import type { SaveDetectedTeamResult } from "../lib/fantasy-football-store"

const call = { toolCallId: "t", messages: [], context: {} }

// A tool result, which these tools never stream
async function run<T>(
  value: T | AsyncIterable<T> | PromiseLike<T | AsyncIterable<T>>
) {
  const output = await value
  if (
    typeof output === "object" &&
    output !== null &&
    Symbol.asyncIterator in output
  )
    throw new Error("unexpected stream")
  return output as T
}
const teamUrl =
  "https://fantasy.espn.com/football/team?leagueId=123456&teamId=2&seasonId=2026"

function tools(pageUrl: string | null, result: SaveDetectedTeamResult) {
  const saves: { pageUrl: string | null; teamName: string }[] = []
  const set = createFantasyFootballTools({
    readPageUrl: async () => pageUrl,
    saveTeam: async (pageUrl, teamName) => {
      saves.push({ pageUrl, teamName })
      return result
    },
  })
  return { set, saves }
}

test("the team is saved from the browser's own address, never from the model", async () => {
  const { set, saves } = tools(teamUrl, {
    status: "saved",
    team: "Dynasty Dogs (League 123456, Team 2, 2026 season)",
    teamUrl,
  })
  const out = await run(
    set.saveEspnTeam.execute!({ teamName: "  Dynasty   Dogs " }, call)
  )
  assert.deepEqual(saves, [{ pageUrl: teamUrl, teamName: "Dynasty Dogs" }])
  assert.equal(out.status, "saved")
  assert.match(out.message, /Saved Dynasty Dogs/)
  // No way to pass a URL
  const schema = set.saveEspnTeam.inputSchema as unknown as {
    safeParse: (value: unknown) => { success: boolean }
  }
  assert.equal(schema.safeParse({ teamName: "x".repeat(81) }).success, false)
  assert.equal(schema.safeParse({}).success, true)
})

test("another saved team, a page that isn't a team, and a bot without settings each explain themselves", async () => {
  const different = tools(teamUrl.replace("teamId=2", "teamId=3"), {
    status: "different",
    team: "League 123456, Team 2, 2026 season",
    teamUrl,
  })
  const out = await run(different.set.saveEspnTeam.execute!({}, call))
  assert.equal(out.status, "different")
  assert.match(out.message, /can't be changed from chat/)

  const elsewhere = tools("https://www.espn.com/fantasy/football/", {
    status: "not_a_team_page",
    pageUrl: "https://www.espn.com/fantasy/football/",
  })
  const away = await run(elsewhere.set.saveEspnTeam.execute!({}, call))
  assert.equal(away.status, "not_a_team_page")
  assert.match(away.message, /My Team/)

  const none = tools(null, { status: "no_settings" })
  const missing = await run(none.set.saveEspnTeam.execute!({}, call))
  assert.match(missing.message, /no ESPN lineup settings/)
})
