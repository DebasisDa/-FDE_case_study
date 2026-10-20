# Report delivery reliability — Phase 1

## Problem

Meridian Payments generates scheduled financial statements for business tenants. A statement sometimes never arrives, and the company learns that from the tenant's email. The job runner already logs every attempt. Nobody watches the log, and the status values are inconsistent, so a miss can sit in the file and still look fine.

Sam Okafor wants that history read on purpose: which report runs never succeeded, why, and which are safe to submit again before a customer notices.

The unit the customer feels is one statement, one `run_id`. A `job_id` is a single attempt. The run succeeded if any attempt is `completed`. The other way this goes wrong is a duplicate: a silent miss becomes a queue of identical submissions, and the tenant may see the same statement twice.

## Phase 1

Phase 1 is a TypeScript command. It reads `starter_kit/data/report_jobs.json` and writes `delivery-report.json`. The same result is printed in the terminal, one row per run, with a reason for every run that is not delivered.

Sam asked for an automatic retry. The materials include no job-runner endpoint, so Phase 1 does not invent a submit call. `retries` in the JSON file is the contract a later phase would hand to the runner: the same `run_id`, the next `attempt_number`, and the tenant and report identity. There is at most one retry row per `run_id`. The same input always produces the same file. The runner must treat `(run_id, attempt_number)` as idempotent, because running this command twice before the new attempt is logged proposes the same row twice.

A timer, live submission, paging, and a schedule-gap check come after Phase 1. The classification rules stay the same.

On the seed the command reports 12 runs, 10 delivered, 1 retry, and 1 escalate.

- `R-003` failed, then `J-004` completed. The statement was delivered.
- `R-010` (Epsilon Media) is a single `error`. It is safe to retry as attempt 2.
- `R-005` (Gamma Health) is `timed_out` for 300 seconds, `timed_out` for 300 seconds, then `failed` in 14 seconds. Two timeouts stop further retries.

## Architecture

`src/jobs` reads the log and rejects a row with no identity or a bad `attempt_number`. Status text is kept and normalized later, so a messy status does not drop the row. `src/classify` orders attempts by `attempt_number`, then `scheduled_at`, and assigns one outcome. `src/report` groups by `run_id` and emits at most one retry row, with the next `attempt_number` one higher than the max already seen. `src/cli.ts` writes the file. `src/terminal.ts` prints it.

The starter helper treats only `failed` and `timed_out` as failures, so an `error` looks fine, and it has no timeout ceiling. Phase 1 replaces that helper. The decision order is the policy table below.

## Assumptions

1. Retrying submits the same `run_id` again, with a new `job_id` and the next `attempt_number`. The seed already does this: `R-003` is `J-003`, then `J-004`.
2. `completed` means the tenant can see the statement. One completed attempt closes the run, even if a later row says `failed`. There is no separate "sent" status. If Sam shows that `completed` only means the process exited, this is the rule to change.
3. Status text is trimmed and lowercased. The seed contains `completed`, `failed`, `timed_out`, and `error`.
4. `failed`, `timed_out`, and `error` are failures. `error` is missing from the starter helper.
5. `running`, `in_progress`, `queued`, and `pending` are still open. None appear in the seed. Any other text is unknown and is never auto-retried. A new word such as `partial` escalates until someone names it.
6. Order is `attempt_number`, then `scheduled_at`. The next attempt is one higher than the max already seen, so a numbering gap cannot collide.
7. There is no schedule catalog. A week with no row is invisible. Guessing a weekly cadence from twelve runs would invent misses that were never scheduled.
8. The same file always produces the same report, with at most one retry row per `run_id`.

## Policy

| Status | While the run is open |
|---|---|
| `completed` | Delivered. Do not retry. |
| `failed`, `error` | Retry while the run has fewer than 3 attempts |
| `timed_out` | Retry only if this would be the first retry. Two timeouts stop. |
| in flight (`running`, `in_progress`, `queued`, `pending`) | Wait. Do not retry over a live attempt. |
| anything else | Escalate. |

Sam left the numbers open. Three attempts total, including the first, absorbs a transient crash and one repeat. A fourth identical submission is how a silent miss becomes a queue of them. Two timeouts is a separate ceiling: in this log a timeout is 300 seconds, Gamma Health used two, and the third attempt still failed in 14 seconds. `failed` and `error` can still use a third attempt when the run has seen fewer than two timeouts. Raising the cap to five would wait on evidence that a fourth or fifth try actually delivers.

## Trade-offs

**A contract, rather than a submit call.** There is no runner endpoint to post to. `retries` stays reviewable, and the policy can be tested without a runner.

**A timeout ceiling beside the attempt budget.** One shared budget would retry Gamma after two 300 second stalls, because an attempt remained. Those stalls are a different failure from a fast `error`. The attempt budget still covers `failed` and `error`.

**Any completed attempt closes the run.** The latest row alone would reopen a run that already succeeded if a later attempt failed. The customer already has the statement.

**Only rows that exist.** A schedule catalog would catch a week that never ran. This file is not that catalog.

**Unknown status escalates.** Auto-retrying an unrecognized word would put a future `cancelled` or `partial` on the queue. A person names the new word first.

## Scale

Twelve runs fit in memory. The outcome rules stay the same when the log grows. The mechanics change:

- Page the log and classify one `run_id` at a time, instead of loading every attempt.
- Keep a watermark of attempts already classified, so each pass reads what is new.
- Cap how many retries one tenant can add in a pass, so one stuck tenant cannot fill the queue.
- Require the runner to ignore a retry it has already accepted for that `(run_id, attempt_number)`.

Live attempts are still left alone. Unknown statuses still escalate. Volume is not a reason to loosen either rule.

## With more time, data, and budget

- More months of logs, to check whether a retry after two timeouts ever delivers. The cap moves if that evidence shows up.
- A schedule catalog, so a missing week can be separated from a tenant who was not due.
- A runner client that posts `retries` and records the new `job_id`. Until that client exists, this command does not invent the call.
- An alert on `escalate`. That is the path that still depends on a person noticing, which is the failure Sam described.
- A cause line from durations already in the log. Repeated 300 second timeouts point at a stall. A failure in a few seconds points at a rejected run. The line explains the row. It does not change who is retried.
