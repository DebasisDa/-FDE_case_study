# Report delivery reliability

Phase 1 reads `starter_kit/data/report_jobs.json` and writes `delivery-report.json`. One `run_id` is one statement. The run is delivered if any attempt is `completed`. Otherwise the outcome is `retry`, `escalate`, or `in progress`.

The command does not submit work. `retries` is the contract a later phase would hand to the job runner, with at most one row per `run_id`. The same input always produces the same file. The design, including the trade-offs and what changes at higher volume, is in `SOLUTION_DESIGN.md`.

On the seed: **12 runs, 10 delivered, 1 retry, 1 escalate.** `R-003` failed and then completed, so it is delivered. `R-010` is safe to retry as attempt 2. `R-005` is escalated after two timeouts.

## Run

```bash
npm install
npm test
npm run report
```

`npm test` runs Jest through ts-jest. Coverage is Istanbul, written to `coverage/` (text, lcov, and HTML).

## Layout

Source and tests are separate. Each module is one file:

- `src/jobs/index.ts` reads and validates the job log.
- `src/classify/index.ts` gives each `run_id` one outcome.
- `src/report/index.ts` builds `delivery-report.json`.
- `src/terminal.ts` prints the colored report.
- `src/cli.ts` is the command.
- `tests/` holds the Jest unit tests.

```bash
node dist/cli.js --input starter_kit/data/report_jobs.json --output delivery-report.json
```

## Policy

Status text is trimmed and lowercased.

- `failed` and `error`: retry while the run has fewer than 3 attempts.
- `timed_out`: retry only when that would be the first retry. Two timeouts stop.
- `running`, `in_progress`, `queued`, and `pending`: wait. Do not retry over a live attempt.
- Any other status: escalate, and never auto-retry.
- The next `attempt_number` is one higher than the max already seen.

## Known limitations

- The command does not call the job runner. `retries` is the contract a person can review. There is no runner endpoint in the materials.
- A week with no row is invisible. Twelve runs are not a schedule catalog.
- Running the command again, before the new attempt is in the log, proposes the same retry. The runner has to treat `(run_id, attempt_number)` as idempotent.
- A status outside the policy table is escalated and is never auto-retried. `completed` is treated as delivered. The log has no separate "sent" status.
- The whole log is loaded into memory. Paging, a watermark, and a per-tenant retry cap belong to a later phase, described in `SOLUTION_DESIGN.md`.
- Phase 1 does not page anyone when the outcome is `escalate`.
