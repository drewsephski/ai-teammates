import assert from "node:assert/strict"
import test from "node:test"
import type { Sandbox } from "@e2b/desktop"
import {
  autonomousLineupAllowed,
  canonicalEspnTeamUrl,
  defaultEspnSeason,
  describeEspnTeam,
  espnTeamScope,
} from "../lib/fantasy-football-policy"
import {
  createComputerGate,
  type ComputerApprovalStore,
} from "../lib/computer-approval-tools"
import { guardVerdict, type GuardOutput } from "../lib/computer-approval-policy"

const teamUrl =
  "https://fantasy.espn.com/football/team?leagueId=123456&teamId=2&seasonId=2026"
const settings = { mode: "autonomous" as const, teamUrl, enabled: true }
const verdict = (patch: Partial<GuardOutput> = {}) =>
  guardVerdict({
    target: "Move bench player to WR",
    impact: "high",
    category: "lineup",
    confidence: "high",
    injection: false,
    hostname: "fantasy.espn.com",
    pageUrl: teamUrl,
    reason: "Start/sit move",
    ...patch,
  })

test("team scopes accept any ESPN football page with the league and team, and reject ambiguous or unsafe links", () => {
  const during = new Date("2026-11-02T20:00:00Z")
  for (const variant of [
    teamUrl.replace("/team?", "/clubhouse?"),
    // Any football page the person copied the address of
    teamUrl.replace("/team?", "/league?"),
    teamUrl.replace("/team?", "/team/schedule?"),
    // The season is the current one when the link leaves it out
    teamUrl.replace("&seasonId=2026", ""),
    // Parameter order and extra parameters don't matter
    "https://fantasy.espn.com/football/team?teamId=2&leagueId=123456&view=roster",
  ])
    assert.equal(canonicalEspnTeamUrl(variant, during), teamUrl, variant)
  assert.deepEqual(espnTeamScope(teamUrl), {
    leagueId: "123456",
    teamId: "2",
    seasonId: "2026",
  })
  for (const invalid of [
    "",
    "https://evil.test/",
    teamUrl.replace("https:", "http:"),
    teamUrl.replace("espn.com", "espn.com.evil.test"),
    teamUrl + "&teamId=4",
    teamUrl + "&seasonId=2025",
    teamUrl.replace("teamId=2&", ""),
    teamUrl.replace("leagueId=123456&", ""),
    teamUrl.replace("2026", "1900"),
    teamUrl.replace("/football/", "/basketball/"),
    teamUrl.replace("https://", "https://user:pass@"),
    "https://fantasy.espn.com/football/",
  ])
    assert.equal(canonicalEspnTeamUrl(invalid, during), null, invalid)
})

test("the default season is the year it started, through the following February", () => {
  assert.equal(defaultEspnSeason(new Date("2026-09-10T00:00:00Z")), "2026")
  assert.equal(defaultEspnSeason(new Date("2027-01-15T00:00:00Z")), "2026")
  assert.equal(defaultEspnSeason(new Date("2027-02-28T00:00:00Z")), "2026")
  assert.equal(defaultEspnSeason(new Date("2027-03-01T00:00:00Z")), "2027")
})

test("a saved team reads as its name and the IDs the permission is bound to", () => {
  assert.equal(
    describeEspnTeam(teamUrl, "Dynasty Dogs"),
    "Dynasty Dogs (League 123456, Team 2, 2026 season)"
  )
  assert.equal(describeEspnTeam(teamUrl), "League 123456, Team 2, 2026 season")
  assert.equal(describeEspnTeam("https://evil.test/", "x"), null)
})

test("only enabled autonomous start/sit moves for the exact league, team and season qualify", () => {
  assert.equal(autonomousLineupAllowed(settings, verdict()), true)
  assert.equal(
    autonomousLineupAllowed({ ...settings, mode: "manual" }, verdict()),
    false
  )
  assert.equal(
    autonomousLineupAllowed({ ...settings, enabled: false }, verdict()),
    false
  )
  assert.equal(autonomousLineupAllowed(null, verdict()), false)
  for (const patch of [
    { category: "roster" as const },
    { category: "purchase" as const },
    { category: "send" as const },
    { confidence: "low" as const },
    { confidence: "medium" as const },
    { injection: true },
    { pageUrl: null },
    { hostname: "espn.com.evil.test" },
    { pageUrl: teamUrl.replace("teamId=2", "teamId=3") },
    { pageUrl: teamUrl.replace("123456", "654321") },
    { pageUrl: teamUrl.replace("2026", "2025") },
  ])
    assert.equal(
      autonomousLineupAllowed(settings, verdict(patch)),
      false,
      JSON.stringify(patch)
    )
})

test("the actual computer gate allows a scoped automatic move and observes revocation on its next gesture", async () => {
  let mode: "manual" | "autonomous" = "autonomous"
  let current = verdict()
  let reads = 0
  const store: ComputerApprovalStore = {
    request: async () => {
      throw new Error("Unexpected approval")
    },
    read: async () => undefined,
    spend: async () => false,
    complete: async () => {},
  }
  const gate = createComputerGate({
    store,
    takeScreenshot: async () => ({
      base64: "screenshot",
      mediaType: "image/png",
      width: 1024,
      height: 768,
    }),
    check: async () => current,
    authorizeLineup: async (v) => {
      reads++
      return autonomousLineupAllowed({ ...settings, mode }, v)
    },
  })
  const click = {
    tool: "mouseClick" as const,
    x: 10,
    y: 10,
    button: "left",
    double: false,
  }
  const sandbox = {} as Sandbox
  const context = { toolCallId: "move1" }
  assert.equal(
    (await gate.gesture(sandbox, click, undefined, context)).claimed,
    undefined
  )
  mode = "manual"
  await assert.rejects(
    gate.gesture(sandbox, click, undefined, context),
    /Approval required/
  )
  assert.equal(reads, 2)
  mode = "autonomous"
  current = verdict({ category: "roster" })
  // A different screenshot invalidates the guard's per-screen result cache.
  const tradeGate = createComputerGate({
    store,
    takeScreenshot: async () => ({
      base64: "trade",
      mediaType: "image/png",
      width: 1024,
      height: 768,
    }),
    check: async () => current,
    authorizeLineup: async () => {
      throw new Error("Trades cannot use lineup permission")
    },
  })
  await assert.rejects(
    tradeGate.gesture(sandbox, click, undefined, context),
    /Approval required/
  )
})
