# Bucket Hours Dashboard — Handoff Summary

## What this is
A personal dashboard replacing a manual Excel time-tracking sheet. Mason runs three weekly time "buckets" — **Work** (1099 day job), **Personal Finance/PF** (household CFO, STR/rentals), and **RWTA** (his tax advisory firm) — plus a **None** category for personal tasks that don't count against any bucket. Each week has a target hour allocation per bucket. Motion (usemotion.com) auto-schedules a generic "Hours" task per bucket representing remaining/unallocated time; adding a specific named task should decrement that bucket's Hours task by the same amount.

## Current state
- **Live, hosted, working shell** at `https://mkimball21.github.io/bucket-dashboard/`
- Repo: `mkimball21/bucket-dashboard` on GitHub, single `index.html` at root, Pages enabled (deploy from `main` branch)
- The file currently has **full UI built and approved**, but **all data is mock/hardcoded** — no live Motion, Google Sheets, or Zapier calls exist yet
- Local API key storage works (`localStorage`, key `motionApiKey`) — never embedded in source, user pastes once per device

## What's built (UI, all using fake data so far)
1. **Motion API key entry** — password field, Save/Clear, persists via localStorage
2. **Bucket summary cards** (Work / PF / RWTA) — each shows Unallocated hours, Worked-so-far vs target, and a progress bar (bar = % of target worked, NOT % remaining — this was a point of confusion, resolved: bar sits directly under "Worked" stat to make clear what it illustrates)
3. **Three standalone total cards** — Total worked this week, Total unallocated, Free time this week (free time calculation logic was never built — still a placeholder number)
4. **Add tasks flow** (two-stage):
   - Stage 1: paste a textarea, one line per task: `name, minutes, bucket, priority` (priority optional, defaults to Medium)
   - Parses into Stage 2: editable card-per-task UI with Name, Minutes, Bucket (Work/RWTA/PF/None), Priority (Low/Medium/High/ASAP), Start date (defaults today), Due date (defaults this Sunday), Schedule (defaults "Anytime (24/7)")
   - Bucket parsing is strict: unrecognized bucket text gets flagged as a skipped-line error rather than silently miscategorized; blank/"none"/"personal" maps to None
   - "Add all to Motion" button currently just appends to a mock "Added today" list — **does not call Motion API yet**
5. **Hours planner sync row** — "Sync now" button currently just shows an alert — **no real Zapier call wired up**

## Verified, working Motion API details (all tested live against real account)

**Base URL:** `https://api.usemotion.com/v1`
**Auth:** header `X-API-Key: <key>`
**CORS:** Motion's API has no CORS restriction — works fine from a real browser tab. (It does NOT work from inside claude.ai's artifact sandbox — that environment's CSP blocks the request. Must be a real hosted page or local file.)

### Confirmed endpoints and quirks:
- `GET /v1/users/me` — returns `{id, name, email}`
- `GET /v1/workspaces` — Mason's only workspace: `id: "kwsI4zmTzceomRsdyXUhZ"`, name "My Tasks (Private)", type INDIVIDUAL
- `GET /v1/tasks?includeAllStatuses=true` — list all tasks. Supports `workspaceId`, `status`, `label`, `name` filters, pagination via `cursor`.
- `GET /v1/schedules` — returns real schedule names. Mason's are exactly: **"Work hours"**, **"Night"**, **"Anytime (24/7)"**, **"Day"**. The "Anytime (24/7)" string must be sent verbatim including the parenthetical — confirmed via live test, not guessed.
- `POST /v1/tasks` — create task. Required: `name`, `workspaceId`. Also accepts `duration` (minutes, integer), `dueDate` (ISO), `labels` (array of strings — this is how bucket tagging works, e.g. `["RWTA"]`), `priority` (`"LOW"|"MEDIUM"|"HIGH"|"ASAP"`).
- `PATCH /v1/tasks/{id}` — update task. **IMPORTANT BUG vs docs**: docs list `workspaceId` as required on PATCH body, but live API returns `400 "property workspaceId should not exist"` if you include it. Do NOT send workspaceId on PATCH. `name` IS required on PATCH even when unchanged.
- To turn on auto-scheduling via PATCH, must send:
  ```json
  "autoScheduled": {
    "startDate": "YYYY-MM-DD",
    "deadlineType": "SOFT",
    "schedule": "Anytime (24/7)"
  }
  ```
  Without this, a created task sits as "Not auto-scheduled" with null `scheduledStart`/`scheduledEnd` even if duration/dueDate are set.
- `priority` field confirmed working on both POST and PATCH (`HIGH`, `ASAP` both tested live, returned correctly, task got scheduled into found slot).
- `DELETE /v1/tasks/{id}` — returns 204, empty body, confirmed working (used for test cleanup).

### Real bucket task data observed (for reference/pattern matching):
Tasks named exactly **"Work Hours"**, **"PF Hours"**, **"RWTA Hours"** exist, one set per week, `dueDate` ~end of that week (a Sunday at 22:59:59.999Z UTC), `status.name` "Todo" until manually completed. At any given time there are usually TWO sets live simultaneously (current week + next week, since Mason's assistant preps next week's tasks in advance per their SOP). **To find "this week's" bucket task: filter by exact name match, status not Completed/Cancelled, and find the one whose dueDate falls within the current Mon\u2013Sun window** (NOT just soonest due date — both current and next week are simultaneously "Todo").

Bucket task `duration` is in minutes and represents the bucket's current remaining/unallocated time for the week.

## The core mechanic still to build: decrement on task creation
When a new named task is added to a bucket (Work/PF/RWTA, not None):
1. Create the task via POST (with label = bucket name, duration, dueDate, priority, autoScheduled fields)
2. Find that bucket's current week "Hours" task (by name + week-window logic above)
3. PATCH that Hours task's duration = (current duration \u2212 new task's duration)
4. Handle the edge case: what if remaining duration would go negative? (Never decided \u2014 needs a decision: clamp at 0, allow negative, or warn/block.)

## Hours Planner Google Sheet — separate data source, different mechanism
- File: "Hours Planner" Google Sheet, file ID `1DbAgVfdW4DJnDBtU7VlrHYmg7nNF0HRWPvGs4WkvlJo`
- One tab per week, named like `06.22.26`, `06.29.26` (MM.DD.YY), chronological left-to-right, oldest first. ~20 tabs exist as of this writing.
- Each tab has: rows 3-6 summary (Category/Start Hours/Less/Task Hours for Work, Personal Finance, Real Wealth), then a row-by-row event log (Date, Start Time, End Time, Duration, Event, Calendar, Grouping) starting around row 12-13.
- **"Grouping" column** is manually filled in weekly by Mason's assistant \u2014 maps calendar events to Work/PF/RWTA/None. This is the ONLY place this mapping exists; Motion has no way to tag calendar events (only tasks).
- **PROBLEM, UNSOLVED**: Google Drive's `read_file_content` and `download_file_content` tools, and plain `web_fetch` on the share URL, all default to reading only the FIRST/active tab in the workbook \u2014 not whatever tab is visually selected, not the newest, not addressable by name. Confirmed via repeated live testing. This makes it impossible to reliably read "this week's" tab via those tools.
- **Decided solution**: rather than fight Google Sheets API/service-account setup (which WOULD solve this \u2014 confirmed Sheets API `spreadsheets.values.get` with a range like `'06.29.26'!A1:G100` can address a tab by name, but requires Google Cloud project + service account JSON key, real setup overhead), the plan is: **Zapier** reads whatever tab is current (Zapier may have its own way to find "newest tab" \u2014 NOT YET VERIFIED) and copies/writes its data into a SEPARATE Google Sheet that only ever has ONE tab. The dashboard then reads that single-tab sheet using the simple tools that already work fine (since "first tab" = "only tab" when there's only one).
- **Trigger for the Zapier sync**: decided to be a manual webhook \u2014 a button in the dashboard ("Sync now") calls a Zapier webhook (Catch Hook trigger) on demand, rather than time-based or edit-triggered. This is because the Hours Planner numbers are LOCKED once set for the week (confirmed by Mason: after the weekly VA review/approval, the sheet isn't edited again that week \u2014 all real-time adjustments happen in Motion instead).
- **NOT YET BUILT**: the actual Zap (webhook trigger \u2192 read current Hours Planner tab \u2192 write to single-tab destination sheet). Zapier MCP connector is available in Claude (directoryUuid `1f6f271e-3d29-4241-b35e-8abe6def4891`) but was not yet connected/used to build this.

## "Worked so far" — the real definition (this took a while to nail down, do not re-derive incorrectly)
**Worked so far per bucket = (sum of grouped calendar events from Hours Planner whose END TIME has already passed, as of right now) + (sum of named Motion tasks tagged to that bucket that are marked Completed).**

Critically: this is NOT the same as the sheet's "Less" row, which is the whole week's grouped total regardless of whether those events have happened yet. A grouped-but-future event (e.g. Thursday's meeting, grouped already, but it's only Wednesday) should NOT count as worked yet, even though it's already been subtracted out of the corresponding bucket's Motion "Hours" task duration. This means **Unallocated will normally be LESS than (Target \u2212 Worked)**, not equal \u2014 confirmed this is not a coincidence-of-equal-numbers situation, deliberately made mock data NOT match to avoid implying a false formula.

This means: showing accurate "Worked so far" requires the dashboard to do its own date/time filtering against the row-level Hours Planner event data (hence needing the full table, not just the Less total) \u2014 recalculated fresh every time the dashboard loads, not just copied from the sheet.

## "Free time this week" \u2014 concept defined, math not built
Three distinct numbers, established via a real Motion calendar screenshot:
1. Per-bucket unallocated (= Motion Hours task duration, already solvable)
2. Whole-week committed vs Mason's 40-55 hr target range (not yet built)
3. **"Free time"** = literal open/unclaimed calendar space, independent of bucket targets \u2014 e.g. in the screenshot, after the last scheduled chunk of the week there was a real gap (4h45m on a Sunday) with nothing scheduled. This needs to read Motion's actual calendar/scheduled events (not yet identified which endpoint best supports "give me gaps in my calendar" \u2014 may need to fetch all scheduled tasks' `scheduledStart`/`scheduledEnd` plus actual calendar events and compute gaps manually).

## Known open decisions (not yet made, flag to Mason if relevant)
- What happens when a bucket's decrement would go negative (over-budget)?
- Free time boundaries: does it only count inside a defined "working hours" schedule, or any literal calendar gap including evenings/weekends? (Real example showed RWTA chunks landing at 6-9pm on a Wednesday, so working hours are clearly broad \u2014 but never explicitly defined.)
- Whether anyone besides Mason (e.g. his assistant) will ever use this tool.

## Hosting / infra
- GitHub account: `mkimball21` (NOT mkimball121 \u2014 this was a typo Claude made once mid-session, caused brief confusion, corrected)
- Repo `bucket-dashboard`, public, single `index.html`, deploy-from-branch Pages setup (no build step, no Jekyll config needed)
- To update the live site: replace `index.html` content in the repo (via GitHub's web upload UI, or git push if working from a clone) \u2014 Pages auto-rebuilds in ~1-2 min, visible in the repo's Actions tab as "pages build and deployment"

## Recommended next steps, in order
1. Wire the bucket cards to real `GET /v1/tasks` calls, filtering for Work/PF/RWTA Hours by the week-window logic above
2. Build the decrement mechanic: "Add all to Motion" should POST each task, then PATCH the matching bucket task's duration down
3. Set up the actual Zapier webhook + Zap (Hours Planner read \u2192 single-tab sheet write), wire "Sync now" to call it
4. Build the single-tab sheet read into the dashboard (should work fine with simple fetch since it'll only ever have one tab)
5. Implement the "worked so far" elapsed-time filtering logic against that single-tab sheet's row data
6. Tackle free time calculation last \u2014 most underspecified piece

## Deferred / explicitly out of scope for now
- ClickUp/Todoist pull-in (planned eventually via a Claude Project with saved instructions that formats pulled tasks into the same paste syntax the dashboard already accepts \u2014 dashboard itself doesn't need to change for this later)
- Push notifications/proactive alerts (would need infrastructure outside the dashboard/Claude entirely)
- AI-assisted auto-grouping of calendar events (assistant already does this manually, not a bottleneck)
