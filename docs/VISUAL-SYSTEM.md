# Visual system specification

## Audit and product requirements

Tracksesh is a time ledger. Its primary loop is start, pause/resume, stop,
label and review. Manual entries and corrections are equally valid time.
Preserve the route table, server clock, persistent timer provider, authentication,
API boundary, validation, tag palette slots, archived history and export format.

| Area | Existing architecture | Required presentation |
| --- | --- | --- |
| Timer `/dashboard` | Ring, centered greeting, recent list, dismissible explainer | Stopwatch first; recent ledger alongside; guidance below |
| Activity `/activity` | Range filters, four statistics, tag/trend/day charts, optional table, entry/edit dialogs | One toolbar, one ruled summary, open chart sections, readable ledger |
| Tags `/tags` | Inline create/edit, usage, archive/restore/delete | Aligned list with stable action and usage columns |
| Account `/account` | Password, export, deletion | Ruled settings sections; destructive action last |
| Authentication | Six routes with repeated wrappers and branding | Shared compact form layout and consistent headings |
| Shared | Navbar, password input, confirmation, label/edit overlays, help panel | Common navigation, forms, dialog shell and state patterns |

Incidental decisions to remove: the ring and empty third dashboard column,
pill buttons, oversized duplicated auth branding, shadows on static forms,
individual statistic cards, and different page-specific widths/radii.
Global input/link rules currently live in auth styles; dialog/button/help rules
live in dashboard styles; generic surfaces live in activity styles. Centralize
these responsibilities. Keep chart geometry and dynamic tag colors local.

## Tokens and primitives

- Typography: native system sans; body 16px/1.5; supporting 14px; labels 12px;
  section titles 18px; page titles 28px. Weights 400, 500, 600. Stopwatch uses
  tabular numerals at 48–80px, the one deliberate large data display.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64px. Page gutters 20px mobile / 32px desktop.
- Widths: shared 1120px workspace; 800px reading/settings content; 416px auth form.
- Color: warm neutral light canvas, white surface, dark ink, muted gray text;
  charcoal dark canvas and lifted neutral surface. Teal for primary actions and
  selected controls. Red only for errors/destruction, amber for paused status.
  Preserve all eight categorical tag slots and textual labels.
- Borders: 1px neutral rules. Radius 6px controls, 12px dialogs/focal surface.
  Shadows only on dialogs/tooltips. No gradients, pulsing or decorative pills.
- `Page`, `PageHeader`, `AuthLayout`, `Dialog`, `StateMessage`: reusable React
  primitives. Bootstrap utilities remain for small alignment and form grids.
- Buttons: 40px minimum height (44px touch), solid primary, outlined secondary,
  quiet tertiary. Native disabled behavior with reduced opacity. Visible 3px
  focus outline; hover never the sole way to discover an action.
- Forms: shared themed inputs, selects and password toggles; clear labels,
  textual invalid feedback, 16px input text on mobile.
- Navigation: shared width and baseline, text-led links, selected underline,
  `aria-current`, mobile disclosure, theme preference preserved.
- Collections: ruled lists/tables, tabular numeric columns. No card per row.
  Settings and charts use section dividers instead of isolated cards.
- Dialogs: native modal focus containment, Escape cancel, restore focus, bounded
  scrolling, common backdrop and padding. Busy dialogs cannot dismiss.
- States: loading is announced; empty explains the next step; failures never
  masquerade as empty data; selection includes text/shape and ARIA state.
- Responsive: timer/recent and charts become one column below 768px; timer first;
  header actions wrap; statistics become 2×2; table scroll stays inside its
  container; tag actions wrap beneath names; no page overflow at 360px.
- Motion: restrained color transitions; honor reduced-motion preference.

## Migration and acceptance

1. Establish tokens, base controls and layout primitives.
2. Rebuild Timer as the reference screen without changing timing behavior.
3. Migrate navigation, dialogs and authentication; migrate Activity, Tags, Account.
4. Delete obsolete styles and replace tests of incidental ring placement with
   tests of workflow priority, responsive containment and keyboard dialogs.
5. Verify desktop/laptop/mobile in both themes and capture representative screens.
6. Run typecheck, lint, unit tests, API isolation tests, .NET build, production
   build and CSP check. Record environmental blockers honestly.

Acceptance: every route uses the common presentation system; all existing actions
remain available; dialogs are keyboard-contained; no horizontal page overflow;
primary content remains readable in both themes; timer survives navigation;
no auth, database or API contract changes. Commit the spec and implementation.

## Implementation and verification — 2026-09-16

Implemented the shared tokens, Page/PageHeader, AuthLayout, StateMessage, native
Dialog and TagPicker. All password fields now share PasswordInput. Replaced the
ring dashboard, migrated all routes and removed the obsolete dashboard CSS and
page-owned shared styles. Activity shows its session ledger by default, and the
Timer's manual-entry link opens the existing entry form. Failed activity/recent
requests have distinct error states rather than misleading empty states.

Verified:

- TypeScript and ESLint pass; all 78 unit tests pass.
- Production frontend build passes (Vite retains its >500 kB bundle advisory).
- `dotnet build server` passes with zero warnings/errors.
- 15 fixture browser checks pass at 1440, 1120 and 360px, covering both themes,
  all workspaces, auth screens, timer transitions, error/empty states, manual
  entry, tag editor, modal focus containment and focus restoration.
- The same fixture checks pass against the built SPA served by the API with
  its actual CSP: 10 desktop/laptop checks, then 5 mobile checks separately.
  A combined run hit the existing 240-request/minute global rate limit; confirmed
  HTTP 429, then reran mobile after the window cleared. No CSP violations reported.
- Visually inspected representative light/dark desktop and mobile captures,
  corrected a trend-axis overlap, and verified the entry/editor/dialog layouts.
  Screenshots are reproducible with `npm run test:ui` in `test-results/ui/`.

Environment limitations:

- `npm run test:api` attempted all 8 tests; all were blocked by connection
  refusal at local Postgres port 54322. `supabase start` cannot connect to the
  Docker Desktop Linux engine. No database changes were made.
- `npm run test:csp` loads the production login and confirms theme boot, but
  cannot sign in because local Supabase Auth at port 54321 is unavailable.
  Fixture CSP coverage does not claim to verify live authentication or RLS.
- Supabase MCP registered for the requested project and authenticated with
  read-only organization/project scopes; `codex mcp list` confirms enabled OAuth.
  Broad scopes were rejected by automatic approval review; no database access
  through this connection was needed for the presentation refactor.
