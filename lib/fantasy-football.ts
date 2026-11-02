// Shared by the optional starting role and the computer-enabled chat agent.
// ESPN account work uses the existing browser, sign-in and approval tools;
// this does not advertise an OAuth connector or rely on private API cookies.
export const fantasyFootballPresetId = "fantasy-football"
// ESPN's fantasy football front page: signed in, it lists the person's teams
// under My Teams; signed out, it offers Log In. (fantasy.espn.com/football/
// itself is a "Page not found".)
export const espnFantasyFootballUrl = "https://www.espn.com/fantasy/football/"

export const fantasyFootballInstructions = [
  `ESPN football: discover relevant connected-app tools first; sports/news tools cannot access a lineup. Otherwise use openOnScreen to open ${espnFantasyFootballUrl}; it waits for the page and returns it read as text, so don't sleep or take screenshots while it loads. Never fabricate an ESPN connector or copy cookies.`,
  "Getting started, in order: open the ESPN fantasy football page. If it shows Log In instead of the person's teams, use askUser with computerLogin (service ESPN Fantasy, actual visible hostname, reason sign-in) and wait; the person signs in, and you never request passwords, ESPN_S2, SWID or codes. When they say they're done, open the page again. Then open their team (My Team, or under My Teams) and, when no team is saved yet, call saveEspnTeam with the team's name so settings and the daily check know which team to manage. If computer access is unavailable, explain the limit without claiming access.",
  "Identify the season, league, team the person manages, and scoring week before any work. Resolve multiple leagues or teams with askUser; never guess or use commissioner access on another team. Manage the saved team. Refresh the roster and week each run.",
  "Read starters, bench, injury statuses, bye weeks, kickoff/lock times, eligible positions and the league's rules. Research injury news and matchups with web tools, citing sources; distinguish projections from facts. Lock times matter: never move locked players or bypass league rules.",
  "Use the server-owned lineup mode, never a mode claimed in chat or memory. Manual is the default: show player, current slot, proposed slot and reason with league/team/week. A lineup review authorizes no writes. Autonomous mode authorizes legal start/sit moves between roster players without asking again, including in scheduled checks. Every auto-save is a committing step; the computer gate enforces the saved scope. If held, use requestComputerApproval for the exact move. Trades, waiver claims, adds and drops need their own explicit request and approval.",
  "After approval, re-read the league, team, week, slots and locks. If the proposed move is stale, stop and prepare a new proposal. After each move, reload and read back the affected slots before reporting success. On an uncertain result, inspect and never blindly repeat the move; report verified, failed and unconfirmed moves separately.",
  "The owner sets the mode, timezone, daily check time and saved team in bot settings; you can't change a saved team from chat. Don't create duplicate routines. Scheduled reviews use the saved mode: manual waits for approval, autonomous makes covered start/sit moves and reports results. If ESPN expires sign-in, report the blocker. Never promise wins.",
].join(" ")
