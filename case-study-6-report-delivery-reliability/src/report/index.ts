import { classifyRun, policyView, type Policy, type RunReport } from "../classify";
import type { JobAttempt } from "../jobs";

export interface RetryRow {
  run_id: string;
  tenant_id: string;
  tenant_name: string;
  report_name: string;
  scheduled_at: string;
  attempt_number: number;
  prior_job_id: string;
  prior_status: string;
}

export interface Summary {
  run_count: number;
  delivered: number;
  retry: number;
  escalate: number;
  "in progress": number;
}

export interface DeliveryReport {
  phase: 1;
  policy: Policy;
  summary: Summary;
  unresolved: RunReport[];
  retries: RetryRow[];
  runs: RunReport[];
}

function retryRow(run: RunReport): RetryRow {
  if (run.next_attempt_number === null) {
    throw new Error(`Run ${run.run_id} is marked retry without a next attempt number.`);
  }
  return {
    run_id: run.run_id,
    tenant_id: run.tenant_id,
    tenant_name: run.tenant_name,
    report_name: run.report_name,
    scheduled_at: run.scheduled_at,
    attempt_number: run.next_attempt_number,
    prior_job_id: run.latest_job_id,
    prior_status: run.latest_status,
  };
}

export function buildReport(jobs: readonly JobAttempt[]): DeliveryReport {
  const groups = new Map<string, JobAttempt[]>();
  for (const job of jobs) {
    const attempts = groups.get(job.run_id) ?? [];
    attempts.push(job);
    groups.set(job.run_id, attempts);
  }

  const runs = [...groups.keys()].sort().map((runId) => classifyRun(groups.get(runId) ?? []));
  const unresolved = runs.filter((run) => run.outcome !== "delivered");
  const summary: Summary = { run_count: runs.length, delivered: 0, retry: 0, escalate: 0, "in progress": 0 };
  for (const run of runs) summary[run.outcome] += 1;

  return {
    phase: 1,
    policy: policyView(),
    summary,
    unresolved,
    retries: unresolved.filter((run) => run.outcome === "retry").map(retryRow),
    runs,
  };
}
