import { z } from "zod"
import type { GuardVerdict } from "@/lib/computer-approval-policy"

export const fantasyModeSchema = z.enum(["manual", "autonomous"])
export type FantasyMode = z.infer<typeof fantasyModeSchema>

export type EspnTeamScope = {
  leagueId: string
  teamId: string
  seasonId: string
}

// ESPN names a season by the year it starts. The season a person manages in
// January or February is still the previous year's.
export function defaultEspnSeason(now = new Date()) {
  const year = now.getUTCFullYear()
  return String(now.getUTCMonth() < 2 ? year - 1 : year)
}

function idParam(url: URL, key: string) {
  const list = url.searchParams.getAll(key)
  return list.length === 1 && /^[1-9]\d{0,11}$/.test(list[0]) ? list[0] : null
}

// The league, team and season a link on fantasy.espn.com points at. Any
// football page with both IDs will do (team, clubhouse, schedule, box score),
// so a person can copy the address of whatever page they're on. The season is
// the current one when the link leaves it out.
export function espnTeamScope(
  value: string,
  now = new Date()
): EspnTeamScope | null {
  try {
    const url = new URL(value)
    if (
      url.origin !== "https://fantasy.espn.com" ||
      url.username ||
      url.password ||
      !url.pathname.startsWith("/football/")
    )
      return null
    const leagueId = idParam(url, "leagueId")
    const teamId = idParam(url, "teamId")
    if (!leagueId || !teamId) return null
    const seasons = url.searchParams.getAll("seasonId")
    if (seasons.length > 1) return null
    const seasonId = seasons.length
      ? idParam(url, "seasonId")
      : defaultEspnSeason(now)
    if (!seasonId || Number(seasonId) < 2000 || Number(seasonId) > 2100)
      return null
    return { leagueId, teamId, seasonId }
  } catch {
    return null
  }
}

export function canonicalEspnTeamUrl(value: string, now = new Date()) {
  const scope = espnTeamScope(value, now)
  return scope
    ? `https://fantasy.espn.com/football/team?leagueId=${scope.leagueId}&teamId=${scope.teamId}&seasonId=${scope.seasonId}`
    : null
}

// How a saved team reads in settings and in chat: the name the bot saw on the
// page when there is one, then the IDs the permission is bound to
export function describeEspnTeam(teamUrl: string, teamName = "") {
  const scope = espnTeamScope(teamUrl)
  if (!scope) return null
  const ids = `League ${scope.leagueId}, Team ${scope.teamId}, ${scope.seasonId} season`
  return teamName ? `${teamName} (${ids})` : ids
}

// A team name as it may be shown: one line, trimmed, never long
export const espnTeamNameSchema = z
  .string()
  .trim()
  .max(80, "Keep the team name under 80 characters.")
  .transform((value) => value.replace(/\s+/g, " "))

// Only server-owned browser evidence and the independent guard can qualify,
// never a URL or action label supplied by the chat agent. Broad roster transactions stay held.
export function autonomousLineupAllowed(
  settings:
    { mode: FantasyMode; teamUrl: string; enabled: boolean } | null | undefined,
  verdict: GuardVerdict
) {
  if (
    settings?.mode !== "autonomous" ||
    !settings.enabled ||
    verdict.category !== "lineup" ||
    verdict.confidence !== "high" ||
    verdict.injection ||
    verdict.hostname !== "fantasy.espn.com" ||
    !verdict.pageUrl
  )
    return false
  const expected = canonicalEspnTeamUrl(settings.teamUrl)
  return expected !== null && canonicalEspnTeamUrl(verdict.pageUrl) === expected
}

export const fantasyRoutinePrompt =
  "Run the saved ESPN fantasy football lineup check. Read the current server-supplied fantasy settings first; if checks are paused or no team is configured, stop without account work. Open only the configured league/team/season, refresh the current scoring week, starters, bench, injuries, byes, eligibility and locks. Use current sources to recommend legal start/sit changes. In manual mode prepare the exact moves for approval; in autonomous mode carry out eligible start/sit changes under the saved permission and verify every affected slot afterward. Never add/drop players, trade, submit waivers or bypass locks under this permission. If ESPN needs sign-in, or time/usage is exhausted, report the blocker. Do not blindly retry an uncertain save. Finish with a brief report of verified moves, unchanged lineup, or blockers."
