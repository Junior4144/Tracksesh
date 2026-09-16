# Demo sign-in recovery

The demo button must authenticate through the configured Supabase Auth service
and continue to the existing destination. It must not bypass authentication or
replace the user's ledger with browser fixtures.

When Auth cannot be reached, show a connection-specific error and re-enable
sign-in so the user can retry. Preserve credential errors for reachable services.
Verify failure followed by successful retry in a browser test.

Original environment: the frontend and API pointed to local Supabase, but its Auth
endpoint refuses connections and Docker is unavailable. Restoring real sign-in
requires either a working local stack or consistent hosted Auth and API database
configuration. Connecting MCP alone does not configure the application.

## Hosted configuration

Use project `hrisygvrmvvozsvoblpv` for both browser Auth and server Postgres.
Remove the implicit local runtime connection. Keep credentials in ignored files:
the browser publishable key in `.env`, and the database connection string plus
server publishable key in `server/Tracksesh.Api/appsettings.Local.json`.
Environment variables and command-line configuration override this development
file. Never include it in publish output. Missing database configuration must
fail explicitly at startup. Integration fixtures remain separate from real data.
Verify demo authentication, authenticated reads, and CSP against the hosted
configuration before declaring the connection complete.

Validation: hosted Auth accepted the existing demo credentials (HTTP 200).
Typecheck, lint, 78 unit tests, 18 fixture browser tests, and frontend/.NET builds
passed. Missing database credentials produce the expected explicit startup error.
Hosted credentials are now configured. Live demo authentication, recent sessions,
timer restoration after refresh, tags, and activity reads pass. Production CSP
checks pass across login, dashboard, activity, account, and tags without console
errors or policy violations.

## Failure recovery contract

An unavailable backend must not look like an empty ledger or an idle stopwatch.
Keep timer actions disabled until the running-session lookup succeeds; offer an
explicit retry. A failed clock-sync request must not discard a known running
session. Recent-session retries show loading and expose the API error. Network
failures and invalid proxy responses receive clear messages. Never automatically
retry mutations: a lost response does not prove the write failed.

Cover transport errors with unit tests and timer/recent-session recovery with
browser tests. Run live authentication and ledger reads separately from fixture
tests; fixture success cannot establish hosted database connectivity.

Recovery validation: 86 unit tests and 24 fixture browser checks passed, along
with typecheck, lint, and frontend build. `npm run test:live` now performs
read-only checks on real recent sessions, timer restoration, tags, and activity.
It now passes against the hosted database.
API isolation tests still require their separate disposable database; they fail
to connect to its local port; they have not been validated against a test database.
