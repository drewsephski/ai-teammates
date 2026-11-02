import { z } from "zod"
import type { GuardVerdict } from "@/lib/computer-approval-policy"

export const fantasyModeSchema = z.enum(["manual", "autonomous"])
export type FantasyMode = z.infer<typeof fantasyModeSchema>

export function espnTeamScope(value: string) {
  try {
    const url = new URL(value)
    if (
      url.origin !== "https://fantasy.espn.com" ||
      url.username ||
      url.password ||
      !["/football/team", "/football/clubhouse"].includes(url.pathname)
    )
      return null
    const values = ["leagueId", "teamId", "seasonId"].map((key) => {
      const list = url.searchParams.getAll(key)
      return list.length === 1 && /^[1-9]\d{0,11}$/.test(list[0])
        ? list[0]
        : null
    })
    const [leagueId, teamId, seasonId] = values
    if (
      !leagueId ||
      !teamId ||
      !seasonId ||
      Number(seasonId) < 2000 ||
      Number(seasonId) > 2100
    )
      return null
    return { leagueId, teamId, seasonId }
  } catch {
    return null
  }
}

export function canonicalEspnTeamUrl(value: string) {
  const scope = espnTeamScope(value)
  return scope
    ? `https://fantasy.espn.com/football/team?leagueId=${scope.leagueId}&teamId=${scope.teamId}&seasonId=${scope.seasonId}`
    : null
}

// Only the independent screenshot guard's view can qualify, never a URL or
// action label supplied by the chat agent. Broad roster transactions stay held.
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
