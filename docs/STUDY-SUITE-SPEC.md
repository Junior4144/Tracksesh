# Study suite foundation

Status: implemented; database isolation verification blocked by local service availability.
Date: 2026-10-11.

This specification supersedes the presentation and navigation requirements in
VISUAL-SYSTEM.md. Existing authentication, session timing, ledger, export and
authorization contracts remain authoritative. No AI service is part of this phase.

## Product contract

Tracksesh is a study workspace for planning time, focusing and reviewing recorded
effort. A projection is never presented as completed study or a guaranteed outcome.
Existing tags become Subjects in the interface, retaining all records and API names.

## Requirements and acceptance examples

| ID | Requirement | Acceptance |
| --- | --- | --- |
| SU-01 | Shared workspace | Signed-in desktop uses a left sidebar; mobile exposes Today, Subjects, Planner and Insights in a bottom bar. Account and sign-out remain accessible. Existing URLs still work. |
| SU-02 | New identity | Paper #F6F4EF, white surfaces, ink #242438, violet #6554C0, forest #34745C. No external fonts, scripts or AI dependencies. Shared controls, typography and spacing apply to every route. |
| SU-03 | Today | Greeting, focus timer, saved routine summary, available-time allocation and recent actual sessions. No fabricated progress or placeholder personal data. |
| SU-04 | Routine projection | User selects integer minutes (1–720), weekdays and a start date. Show the next 7 days, calendar month and calendar year from that date, end exclusive. Month/year boundaries clamp to the last valid day. Count calendar days, including leap years, independently of DST. 20 minutes daily from 2026-04-01 yields 10h in a month and 121h 40m in a year. |
| SU-05 | Custom horizon | Inclusive start/end dates, maximum 3660 days. Reversed/missing dates and empty weekday selection explain the problem; no misleading calculated result. |
| SU-06 | Time allocation | Enter total available minutes (1–1440), total break minutes (0–available), select active subjects and give each a relative weight (1–10). Allocate whole study minutes using largest remainder, with stable subject order for ties. 90 available minus 15 break, weights 2:1, yields 50 and 25 study minutes. Sum always equals the study budget. All-break budgets yield zero study time. |
| SU-07 | Persistence | Explicit Save plan stores valid routine/allocation preferences under a versioned per-user browser key. Today reads the saved settings. UI states browser-only storage and offers reset. Corrupt or unavailable storage does not crash the app or claim a successful save. No cross-device sync claimed. Archived/deleted subjects do not receive allocation. |
| SU-08 | Timer continuity | Existing server-clock start/pause/resume/stop/label workflow survives navigation. Off Today, a compact session bar supports pause/resume/stop. Label dialog is global so stopping elsewhere works. Failure remains visible. |
| SU-09 | Subjects and Insights | Subjects retains create, rename, recolor, archive/restore, delete and actual totals. Insights retains range summaries, charts, manual entry, editing and deletion. Old /tags and /activity links remain valid; new /subjects and /insights are canonical. |
| SU-10 | Accessibility | Semantic navigation, labelled fields, visible focus, errors with text, no reliance on color, 44px touch targets, reduced motion. No document overflow at 360, 1120 and 1440px; bottom navigation does not obscure content or session controls. |
| SU-11 | Foundation scope | Retain React/Vite, Bootstrap utilities, ASP.NET API and existing database schema. No exam/task/calendar sync, notes editor, AI, billing or deployment in this phase. Saved plans are estimates, not scheduled session records. |

## Architecture

- Pure `src/lib/study-plan.ts` functions own calendar math, validation and allocation.
- A per-account StudyPlanProvider owns saved preferences; Planner owns unsaved edits.
- Today consumes the saved plan and existing recent sessions. It does not derive daily
  completion from the truncated recent-sessions endpoint.
- Subjects are fetched through `lib/blocks.ts`; no new fetch or database route.
- The app shell owns navigation and the global session completion dialog.
- Bootstrap remains a utility foundation; suite-specific SCSS owns the visual identity.

## Implementation sequence

1. Write this spec and numerical acceptance tests.
2. Implement plan math, validation and browser persistence.
3. Implement shell, Today, Planner and shared palette; align Subjects/Insights/public copy.
4. Verify calculations and user journeys with deterministic browser fixtures.
5. Run required typecheck, lint, unit, API, .NET, production and CSP checks.
6. Record evidence and environmental limitations here.

## Verification

Completed on 2026-10-11:

- `npm run typecheck`, `npm run lint`, `npm test`: pass (96 unit tests).
- `npm run build`: pass; existing Vite >500 kB bundle advisory remains.
- `dotnet build server`: pass, zero warnings/errors.
- Responsive fixture checks: 33 suite checks, 24 recovery checks and 21 admin
  checks pass across 1440px, 1120px and 360px. Existing URLs and mutation flows
  remain covered. Recovery tests caught and prevented a provider remount that
  would have repeated one-time email verification.
- Production CSP: `npm run test:csp` passes with live sign-in and navigation
  through Today, Planner, Insights, Account and Subjects; no console errors.
- Four mobile suite acceptance checks also pass against the built SPA served
  by ASP.NET with its actual CSP (network fixtures for user data).
- Visually reviewed desktop Today and Planner plus mobile Today. Moved the
  mobile timer directly below the greeting and retained bottom navigation.
- Screenshots are reproducible under `test-results/ui/` with `test:ui`.
- `npm run test:api`: 54 pass; 8 RLS integration checks cannot connect to
  `127.0.0.1:54322` (connection refused). This is not a verified isolation pass.
  No database schema, policy, API or authentication implementation was changed.

Browser tests live in `e2e/ui.spec.ts`; numerical acceptance tests live in
`src/lib/study-plan.test.ts`. SU-04/05 maps to calendar tests; SU-06 maps to exact
budget tests; SU-07 maps to account separation, persistence and storage failure
tests; SU-08 maps to global stop/label and recovery regression checks; SU-01/02/09/10
map to responsive route screenshots and existing UI workflows.

Intentional limits: plans are browser-local, projections are estimates, and
allocation is a reusable time budget separate from the daily routine. There is
no AI runtime, automatic scheduling, or deployment in this change.
