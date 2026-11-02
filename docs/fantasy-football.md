# ESPN fantasy football

Fantasy Coach (`fantasy-football`) is an optional starting role on web and mobile.
Creation offers **Manual approval** (the default) and **Automatic**. Setup then
happens in chat: the new chat opens with a brief that asks the bot to open ESPN on
the cloud computer, have the person sign in when ESPN asks, find their team, save
it, and review this week's lineup. The bot saves the team with `saveEspnTeam`
(`lib/fantasy-football-tools.ts`), which reads the browser's document URL on the
server, never a URL the model typed, and stores the canonical team link plus the
team's name in `fantasy_football_settings`. Existing accounts can add the role
from the bot picker. Nothing is created by default.

Bot settings show the saved team ("Saved team: Name (League 123, Team 4, 2026
season)"), the mode, the daily check switch, its time and the timezone. The team
link field accepts any `fantasy.espn.com/football/...` page URL that carries
`leagueId` and `teamId`; `seasonId` is optional and defaults to the current
season (`lib/fantasy-football-policy.ts`). A team the owner saved is never
replaced from chat: changing teams is done in settings, because the automatic
permission is bound to that team. Use **Save lineup settings** to apply these
preferences; they save independently from the bot's identity and appearance.
Manual lineup changes and every trade use the existing **Approve** / **Decline**
cards in chat.

On the web, choose **Fantasy football** under **Workspace → Start with a preset**.
The ESPN front page the bot opens is `https://www.espn.com/fantasy/football/`
(`espnFantasyFootballUrl`); `fantasy.espn.com/football/` itself is a 404.
`openOnScreen` waits for the page to finish loading and returns it already read,
restarting a hung browser once, so the first thing the bot sees is the page
rather than a blank desktop (`lib/browser-page.ts`).

## Execution and permission

Both modes use the same roster review: refresh the current scoring week, starters,
bench, scoring rules, eligibility, injury news, byes, kickoff times and locks.
The browser integration uses existing computer, sign-in and verification tools;
it adds no ESPN OAuth connector, private cookie collection, or unofficial API
client. ESPN sign-in/MFA/CAPTCHA stays under the person's control. ESPN can expire
sign-in, and account computer/AI allowances still apply. Neither mode promises
uninterrupted access, guaranteed points or continuous injury monitoring.

Manual mode holds every committing lineup move in the existing approval flow.
Automatic mode grants start/sit permission only for the configured league, team
and season, while checks are enabled. The permission lives in
`fantasy_football_settings`, written by the authenticated owner through the web
server action or `GET`/`PUT /api/v1/bots/:botId/fantasy-football`. It is separate
from bot instructions, memory, chat messages and `configureBot`.

Every committing gesture still goes through the independent screenshot guard.
Only a high-confidence `lineup` verdict, without injection, on
`fantasy.espn.com`, with the browser's actual document URL matching the saved team scope can
use automatic permission. A fresh database read is required for each gesture.
An uncertain scope or action falls back to approval. Adds, drops, waivers,
trades, purchases and other actions never use this permission. ESPN's own
[locked-roster rules](https://support.espn.com/hc/en-us/articles/4669616628500-Roster-Adjustments-After-Players-Have-Locked)
remain authoritative. The classifier is a model; this does not replace ESPN's
ownership, eligibility or lock enforcement.

After each move the bot reopens or reloads the roster and checks the affected
slots. Uncertain saves are inspected before any retry, and the bot reports
verified changes and blockers separately. Tool actions remain in the chat
transcript; scheduled runs also retain routine history and the existing activity
report/notification.

## Scheduling and revocation

Saving enabled checks creates one idempotent daily routine using the existing
scheduler, usage gates and run history. Further saves update that same routine.
The routine reads the current server-owned settings on every run, so changing
mode does not require rewriting a stored prompt. Routine limits still apply.
The app displays the next run returned by the server, rather than assuming that
saving a preference created a schedule. Choose a check time before kickoff;
this is a daily check, not continuous monitoring.

Saving manual mode, pausing checks, or changing teams revokes the previous
automatic permission before schedule reconciliation. A routine-capacity failure
cannot keep a revoked grant active. Pausing/deleting the routine from Activity
also disables automatic permission. Deleting the bot cascades its saved grant.
Creation retries never regrant a mode revoked later.

## Release and verification

The new settings table must be pushed additively with `pnpm db:push` before the
Railway backend and matching Trigger.dev worker deploy. Ship the new mobile
binary for the creation choice and settings controls. Keep all source changes
uncommitted unless the owner explicitly requests a commit.

Offline tests cover scope parsing, guarded automatic execution, manual holds,
revocation, owner isolation, settings validation, saving the detected team,
managed schedule creation and updates, pause behavior, deletion, API payloads,
browser page waiting, and the mobile catalog-to-create request. They do not
prove ESPN's current website or an actual saved lineup.
`pnpm exec tsx --env-file=.env.local scripts/verify-espn-browser.ts` creates a
throwaway computer from the template, opens the ESPN front page and a signed-out
team page through the real `openOnScreen` path, checks that the screen reader
sees them, and deletes the computer; it spends a few minutes of Hobby time and
no model calls.

Live acceptance with an authorized ESPN account:

1. Create Fantasy Coach in each mode and confirm the choice persists. Let the
   opening brief run: sign in through the Desktop sign-in card, and confirm the
   bot saves the right team (the settings show it) with the timezone and check
   time; verify the displayed next run.
2. Confirm the correct league, team, season and scoring week, including injury,
   bye and locked-player states.
3. In manual mode, request one legal unlocked start/sit move. Decline it first
   and confirm ESPN is unchanged; then explicitly request and approve a move and
   independently check the roster against the bot's read-back.
4. In automatic mode, run the daily check and confirm a legal start/sit move
   requires no approval. Verify the saved slots directly in ESPN. Attempts on
   another team/season, waivers, trades and add/drop transactions must still hold.
5. Switch to manual or pause while a run is active; the next committing gesture
   must lose automatic permission. Check expired sign-in, exhausted allowances,
   uncertain saves, routine deletion and routine-capacity failures.

A real roster mutation needs the account owner's authorization and sign-in.
A successful build/upload is separate from Apple processing and TestFlight
availability; report the provider's actual state for the new build.
