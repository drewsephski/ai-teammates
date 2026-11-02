import { tool } from "ai"
import { z } from "zod"

import type { SaveDetectedTeamResult } from "@/lib/fantasy-football-store"
import { espnTeamNameSchema } from "@/lib/fantasy-football-policy"

// Reads the browser's current document URL on the person's computer, from the
// desktop's accessibility tree, so the saved scope comes from what the browser
// is really on. Null when no page is open or the computer is busy.
export type FantasyFootballToolDeps = {
  readPageUrl: () => Promise<string | null>
  saveTeam: (
    pageUrl: string | null,
    teamName: string
  ) => Promise<SaveDetectedTeamResult>
}

// Only Fantasy Coach bots (those with lineup settings) get this tool
export function createFantasyFootballTools(deps: FantasyFootballToolDeps) {
  return {
    saveEspnTeam: tool({
      description:
        "Save the ESPN fantasy football team the browser is on as the team this bot manages, so bot settings and the daily lineup check know which league, team and season to use. Open the person's team page on fantasy.espn.com first (My Team): the league, team and season are read from the browser's own address, not from what you pass. Pass the team name as shown on the page. A team the owner already saved is never replaced here; they change it in bot settings.",
      inputSchema: z.object({
        teamName: espnTeamNameSchema
          .optional()
          .describe("The team's name as it appears on the page"),
      }),
      execute: async ({ teamName }) => {
        const pageUrl = await deps.readPageUrl()
        const result = await deps.saveTeam(
          pageUrl,
          espnTeamNameSchema.parse(teamName ?? "")
        )
        switch (result.status) {
          case "saved":
            return {
              ...result,
              message: `Saved ${result.team} as the team to manage. Bot settings show it, and the daily check uses it.`,
            }
          case "unchanged":
            return {
              ...result,
              message: `${result.team} is already the saved team.`,
            }
          case "different":
            return {
              ...result,
              message: `Another team is already saved: ${result.team}. Manage that one, or ask the person to change the team in bot settings; it can't be changed from chat.`,
            }
          case "not_a_team_page":
            return {
              ...result,
              message:
                "The browser isn't on a team page. Open the person's team on fantasy.espn.com (My Team, with leagueId and teamId in the address), check with readScreen, then call this again.",
            }
          case "no_settings":
            return {
              ...result,
              message:
                "This bot has no ESPN lineup settings, so there's nothing to save the team into.",
            }
        }
      },
    }),
  }
}

export type FantasyFootballTools = ReturnType<typeof createFantasyFootballTools>
