import { JobLogError, type JobAttempt } from "../jobs";

export const OUTCOMES = ["delivered", "retry", "escalate", "in progress"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type Rule =
  | "completed"
  | "in_flight"
  | "unknown_status"
  | "timeout_ceiling"
  | "timeout_first_retry"
  | "timeout_not_first_retry"
  | "failure_retry"
  | "attempt_ceiling";

export interface AttemptView {
  job_id: string;
  attempt_number: number;
  scheduled_at: string;
  logged_status: string;
  status: string;
  duration_seconds: number | null;
  row_count: number | null;
}

export interface RunReport {
  run_id: string;
  tenant_id: string;
  tenant_name: string;
  report_name: string;
  scheduled_at: string;
  outcome: Outcome;
  rule: Rule;
  reason: string;
  attempt_count: number;
  timeout_count: number;
  latest_job_id: string;
  latest_status: string;
  next_attempt_number: number | null;
  attempts: AttemptView[];
}

export interface Policy {
  max_attempts: number;
  max_timeouts: number;
  failure_statuses: readonly string[];
  timeout_status: string;
  in_flight_statuses: readonly string[];
  outcomes: readonly Outcome[];
}

const MAX_ATTEMPTS = 3;
const MAX_TIMEOUTS = 2;
const FAILURES = new Set(["failed", "error"]);
const IN_FLIGHT = new Set(["running", "in_progress", "queued", "pending"]);
const KNOWN = new Set(["completed", "timed_out", ...FAILURES, ...IN_FLIGHT]);

export function policyView(): Policy {
  return {
    max_attempts: MAX_ATTEMPTS,
    max_timeouts: MAX_TIMEOUTS,
    failure_statuses: [...FAILURES],
    timeout_status: "timed_out",
    in_flight_statuses: [...IN_FLIGHT],
    outcomes: OUTCOMES,
  };
}

interface Decision {
  outcome: Outcome;
  rule: Rule;
  reason: string;
}

function decision(outcome: Outcome, rule: Rule, reason: string): Decision {
  return { outcome, rule, reason };
}

function shown(status: string): string {
  return status === "" ? "(blank)" : status;
}

function decide(attempts: readonly AttemptView[]): Decision {
  const completed = attempts.find((attempt) => attempt.status === "completed");
  if (completed) return decision("delivered", "completed", `Attempt ${completed.job_id} completed, so the statement was delivered.`);

  const live = attempts.findLast((attempt) => IN_FLIGHT.has(attempt.status));
  if (live) return decision("in progress", "in_flight", `Attempt ${live.job_id} is ${live.status}. Do not retry over a live attempt.`);

  const unknown = attempts.findLast((attempt) => !KNOWN.has(attempt.status));
  if (unknown) {
    return decision("escalate", "unknown_status", `Status "${shown(unknown.status)}" on ${unknown.job_id} is not recognized and is never auto-retried.`);
  }

  const timeouts = attempts.filter((attempt) => attempt.status === "timed_out").length;
  if (timeouts >= MAX_TIMEOUTS) {
    return decision("escalate", "timeout_ceiling", `The run has ${timeouts} timed_out attempts. Two timeouts stop further retries.`);
  }

  const latest = attempts[attempts.length - 1];
  if (latest.status === "timed_out") {
    return attempts.length === 1
      ? decision("retry", "timeout_first_retry", `Latest attempt ${latest.job_id} timed out. This would be the first retry.`)
      : decision("escalate", "timeout_not_first_retry", `Latest attempt ${latest.job_id} timed out. A retry is allowed only when it would be the first retry.`);
  }

  if (FAILURES.has(latest.status)) {
    return attempts.length < MAX_ATTEMPTS
      ? decision("retry", "failure_retry", `Latest attempt ${latest.job_id} is ${latest.status}, and the run has ${attempts.length} of ${MAX_ATTEMPTS} attempts.`)
      : decision("escalate", "attempt_ceiling", `Latest attempt ${latest.job_id} is ${latest.status}, and the run already has ${attempts.length} attempts.`);
  }

  return decision("escalate", "unknown_status", `Status "${shown(latest.status)}" on ${latest.job_id} is not recognized and is never auto-retried.`);
}

function byAttempt(left: { job: JobAttempt; index: number }, right: { job: JobAttempt; index: number }): number {
  if (left.job.attempt_number !== right.job.attempt_number) return left.job.attempt_number - right.job.attempt_number;
  if (left.job.scheduled_at !== right.job.scheduled_at) return left.job.scheduled_at < right.job.scheduled_at ? -1 : 1;
  return left.index - right.index;
}

export function classifyRun(jobs: readonly JobAttempt[]): RunReport {
  if (jobs.length === 0) throw new JobLogError("Cannot classify a run with no attempts.");
  if (new Set(jobs.map((job) => job.run_id)).size !== 1) {
    throw new JobLogError("classifyRun expects attempts from a single run_id.");
  }

  const ordered = jobs.map((job, index) => ({ job, index })).sort(byAttempt);
  const attempts = ordered.map(({ job }) => ({
    job_id: job.job_id,
    attempt_number: job.attempt_number,
    scheduled_at: job.scheduled_at,
    logged_status: job.status,
    status: job.status.trim().toLowerCase(),
    duration_seconds: job.duration_seconds,
    row_count: job.row_count,
  }));
  const first = ordered[0].job;
  const latest = attempts[attempts.length - 1];
  const result = decide(attempts);

  return {
    run_id: first.run_id,
    tenant_id: first.tenant_id,
    tenant_name: first.tenant_name,
    report_name: first.report_name,
    scheduled_at: attempts[0].scheduled_at,
    ...result,
    attempt_count: attempts.length,
    timeout_count: attempts.filter((attempt) => attempt.status === "timed_out").length,
    latest_job_id: latest.job_id,
    latest_status: latest.status,
    next_attempt_number: result.outcome === "retry" ? Math.max(...attempts.map((attempt) => attempt.attempt_number)) + 1 : null,
    attempts,
  };
}
