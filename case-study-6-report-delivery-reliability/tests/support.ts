import fs from "node:fs";
import path from "node:path";

import type { JobAttempt } from "../src/jobs";
import { parseJobs } from "../src/jobs";
import type { DeliveryReport } from "../src/report";

export const SEED_PATH = path.resolve(__dirname, "../starter_kit/data/report_jobs.json");

export function loadSeedJobs(): JobAttempt[] {
  return parseJobs(JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as unknown);
}

export function attempt(
  runId: string,
  jobId: string,
  attemptNumber: number,
  status: string,
  scheduledAt = "2026-09-01T02:00:00",
): JobAttempt {
  return {
    job_id: jobId,
    run_id: runId,
    tenant_id: "T-01",
    tenant_name: "Alpha Corp",
    report_name: "Monthly Statement",
    scheduled_at: scheduledAt,
    status,
    attempt_number: attemptNumber,
    duration_seconds: 10,
    row_count: null,
  };
}

export function assertContract(report: DeliveryReport): void {
  const summary = report.summary;
  expect(summary.delivered + summary.retry + summary.escalate + summary["in progress"]).toBe(summary.run_count);
  expect(summary.run_count).toBe(report.runs.length);
  expect(report.unresolved).toHaveLength(summary.retry + summary.escalate + summary["in progress"]);

  const retryRuns = report.runs.filter((run) => run.outcome === "retry");
  expect(report.retries).toHaveLength(retryRuns.length);
  expect(new Set(report.retries.map((retry) => retry.run_id)).size).toBe(report.retries.length);

  report.retries.forEach((retry, index) => {
    const run = retryRuns[index];
    expect(retry).toMatchObject({
      run_id: run.run_id,
      attempt_number: run.next_attempt_number,
      prior_job_id: run.latest_job_id,
      prior_status: run.latest_status,
      scheduled_at: run.scheduled_at,
      tenant_id: run.tenant_id,
    });
  });

  for (const run of report.runs) {
    if (run.outcome === "retry") {
      expect(run.next_attempt_number).toBe(Math.max(...run.attempts.map((item) => item.attempt_number)) + 1);
    } else {
      expect(run.next_attempt_number).toBeNull();
    }
  }
}
