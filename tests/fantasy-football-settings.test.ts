import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { eq } from "drizzle-orm"
import { startTestDatabase } from "./helpers/test-db"
import { guardVerdict } from "../lib/computer-approval-policy"

let database: Awaited<ReturnType<typeof startTestDatabase>>
let db: typeof import("../db").db
let schema: typeof import("../db/schema")
let service: typeof import("../services/fantasy-football")
let store: typeof import("../lib/fantasy-football-store")
let routines: typeof import("../lib/routines")
const teamUrl =
  "https://fantasy.espn.com/football/team?leagueId=123456&teamId=2&seasonId=2026"
const values = {
  mode: "autonomous",
  teamUrl,
  enabled: true,
  timezone: "America/Chicago",
  checkTime: "10:30",
}

before(async () => {
  database = await startTestDatabase()
  ;({ db } = await import("../db"))
  schema = await import("../db/schema")
  service = await import("../services/fantasy-football")
  store = await import("../lib/fantasy-football-store")
  routines = await import("../lib/routines")
  await db.insert(schema.bots).values({
    id: "coach",
    userId: "A",
    name: "Coach",
    job: "Fantasy football manager",
  })
  await db
    .insert(schema.chats)
    .values({ id: "chat", userId: "A", kind: "direct" })
})
after(async () => database?.stop())

test("settings are owner-scoped and a creation retry never regrants a revoked mode", async () => {
  await service.initializeFantasySettings("A", "coach", "manual")
  await service.initializeFantasySettings("A", "coach", "autonomous")
  assert.equal((await service.getFantasySettings("A", "coach"))?.mode, "manual")
  assert.equal(
    "userId" in (await service.getFantasySettings("A", "coach"))!,
    false
  )
  await assert.rejects(
    service.getFantasySettings("B", "coach"),
    /Bot not found/
  )
  await assert.rejects(
    service.saveFantasySettings("B", "coach", values),
    /Bot not found/
  )
  assert.equal(await store.readFantasySettings("B", "coach"), null)
})

test("saved checks create one managed daily routine, update it, and revoke automatic moves immediately", async () => {
  let creates = 0
  let updates = 0
  const deps = {
    createRoutine: (async (_user, input) => {
      creates++
      const [row] = await db
        .insert(schema.routines)
        .values({
          id: "managed",
          userId: "A",
          botId: "coach",
          chatId: "chat",
          title: input.title,
          prompt: input.prompt,
          schedule: input.schedule,
          timezone: input.timezone,
          nextRunAt: new Date("2026-11-03T16:30:00Z"),
        })
        .returning()
      return routines.publicRoutine(row)
    }) satisfies typeof routines.createRoutine,
    updateRoutine: (async (_user, id, input) => {
      updates++
      const [row] = await db
        .update(schema.routines)
        .set({
          ...input,
          nextRunAt:
            input.enabled === false ? null : new Date("2026-11-03T16:30:00Z"),
        })
        .where(eq(schema.routines.id, id))
        .returning()
      return routines.publicRoutine(row)
    }) satisfies typeof routines.updateRoutine,
  }
  const first = await service.saveFantasySettings("A", "coach", values, deps)
  assert.equal(first?.routineId, "managed")
  assert.ok(first?.nextRunAt)
  const [routine] = await db.select().from(schema.routines)
  assert.deepEqual(routine.schedule, {
    kind: "daily",
    time: "10:30",
    days: [0, 1, 2, 3, 4, 5, 6],
  })
  const verdict = guardVerdict({
    target: "Start WR",
    impact: "high",
    category: "lineup",
    confidence: "high",
    injection: false,
    hostname: "fantasy.espn.com",
    pageUrl: teamUrl,
    reason: "Start/sit",
  })
  assert.equal(await store.authorizeFantasyLineup("A", "coach", verdict), true)
  const truncated = { ...verdict, pageUrl: null }
  assert.equal(
    await store.authorizeFantasyLineup(
      "A",
      "coach",
      truncated,
      async () => teamUrl
    ),
    true
  )
  assert.equal(
    await store.authorizeFantasyLineup("A", "coach", truncated, async () =>
      teamUrl.replace("teamId=2", "teamId=3")
    ),
    false
  )
  assert.equal(
    await store.authorizeFantasyLineup("A", "coach", verdict, async () => null),
    false
  )
  assert.equal(
    await store.authorizeFantasyLineup("A", "coach", verdict, async () => {
      throw new Error("Browser unreadable")
    }),
    false
  )
  await store.authorizeFantasyLineup("B", "coach", verdict, async () => {
    assert.fail("Another account must not inspect this browser")
  })
  assert.equal(await store.authorizeFantasyLineup("B", "coach", verdict), false)
  await service.saveFantasySettings(
    "A",
    "coach",
    { ...values, mode: "manual", checkTime: "11:00" },
    deps
  )
  assert.equal(await store.authorizeFantasyLineup("A", "coach", verdict), false)
  const paused = await service.saveFantasySettings(
    "A",
    "coach",
    { ...values, enabled: false },
    deps
  )
  assert.equal(paused?.nextRunAt, null)
  assert.equal(await store.authorizeFantasyLineup("A", "coach", verdict), false)
  assert.equal(creates, 1)
  assert.equal(updates, 2)
  assert.equal((await db.select().from(schema.routines)).length, 1)
  await service.saveFantasySettings("A", "coach", values, deps)
  await db.delete(schema.routines).where(eq(schema.routines.id, "managed"))
  await assert.rejects(
    service.saveFantasySettings(
      "A",
      "coach",
      { ...values, mode: "manual" },
      {
        ...deps,
        createRoutine: async () => {
          throw new Error("Routine limit reached")
        },
      }
    ),
    /Routine limit reached/
  )
  assert.equal((await service.getFantasySettings("A", "coach"))?.mode, "manual")
  assert.equal(await store.authorizeFantasyLineup("A", "coach", verdict), false)
})

test("the bot saves the team the browser is on, and only the owner changes a saved team", async () => {
  await db
    .update(schema.fantasyFootballSettings)
    .set({ teamUrl: "", teamName: "" })
    .where(eq(schema.fantasyFootballSettings.botId, "coach"))
  // Not a team page: nothing saved
  assert.deepEqual(
    await store.saveDetectedTeam(
      "A",
      "coach",
      "https://www.espn.com/fantasy/football/",
      "Dynasty Dogs"
    ),
    {
      status: "not_a_team_page",
      pageUrl: "https://www.espn.com/fantasy/football/",
    }
  )
  assert.equal(
    (await store.saveDetectedTeam("A", "coach", null, "")).status,
    "not_a_team_page"
  )
  // The season comes from the calendar when the address leaves it out
  const saved = await store.saveDetectedTeam(
    "A",
    "coach",
    "https://fantasy.espn.com/football/team?leagueId=123456&teamId=2",
    " Dynasty   Dogs "
  )
  assert.equal(saved.status, "saved")
  assert.equal(
    "teamUrl" in saved && saved.teamUrl,
    teamUrl.replace(
      "2026",
      String(
        new Date().getUTCMonth() < 2
          ? new Date().getUTCFullYear() - 1
          : new Date().getUTCFullYear()
      )
    )
  )
  assert.match(
    "team" in saved ? saved.team : "",
    /^Dynasty Dogs \(League 123456, Team 2/
  )
  const shown = await service.getFantasySettings("A", "coach")
  assert.equal(shown?.teamName, "Dynasty Dogs")
  assert.match(shown?.team ?? "", /^Dynasty Dogs/)
  // The same team again is no change; another team is refused from chat
  assert.equal(
    (await store.saveDetectedTeam("A", "coach", shown!.teamUrl, "Dynasty Dogs"))
      .status,
    "unchanged"
  )
  const other = await store.saveDetectedTeam(
    "A",
    "coach",
    shown!.teamUrl.replace("teamId=2", "teamId=9"),
    "Rival"
  )
  assert.equal(other.status, "different")
  assert.equal(
    (await service.getFantasySettings("A", "coach"))?.teamName,
    "Dynasty Dogs"
  )
  // Nobody else's bot
  assert.deepEqual(
    await store.saveDetectedTeam("B", "coach", shown!.teamUrl, "x"),
    {
      status: "no_settings",
    }
  )
  // The owner changing the team in settings drops the name the bot read
  const changed = await service.saveFantasySettings("A", "coach", {
    ...values,
    mode: "manual",
    enabled: false,
    teamUrl: shown!.teamUrl.replace("teamId=2", "teamId=9"),
  })
  assert.equal(changed?.teamName, "")
  assert.match(changed?.team ?? "", /^League 123456, Team 9/)
  // Saving the same team keeps it
  const kept = await service.saveFantasySettings("A", "coach", {
    ...values,
    mode: "manual",
    enabled: false,
    teamUrl: shown!.teamUrl.replace("teamId=2", "teamId=9"),
  })
  assert.equal(kept?.team, changed?.team)
  assert.match(
    store.fantasySettingsInstructions(
      await store.readFantasySettings("A", "coach")
    ),
    /Team 9/
  )
  await db
    .update(schema.fantasyFootballSettings)
    .set({ teamUrl: "" })
    .where(eq(schema.fantasyFootballSettings.botId, "coach"))
  assert.match(
    store.fantasySettingsInstructions(
      await store.readFantasySettings("A", "coach")
    ),
    /call saveEspnTeam/
  )
})

test("invalid scope, timezone and time cannot enable unattended checks", async () => {
  for (const patch of [
    { teamUrl: "" },
    { teamUrl: "https://evil.test/" },
    { timezone: "invalid" },
    { checkTime: "25:99" },
    { mode: "anything" },
  ])
    await assert.rejects(
      service.saveFantasySettings("A", "coach", { ...values, ...patch })
    )
})

test("deleting a bot cascades its saved permission", async () => {
  await db.delete(schema.bots).where(eq(schema.bots.id, "coach"))
  assert.equal(await store.readFantasySettings("A", "coach"), null)
})
