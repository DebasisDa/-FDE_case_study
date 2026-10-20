import type { Outcome, RunReport } from "./classify";
import type { DeliveryReport } from "./report";

const COLOR: Record<Outcome, string> = { delivered: "32", retry: "33", escalate: "31", "in progress": "36" };

export function useColor(stream: NodeJS.WriteStream = process.stdout): boolean {
  if ("NO_COLOR" in process.env || process.env.FORCE_COLOR === "0") return false;
  return process.env.FORCE_COLOR !== undefined || Boolean(stream.isTTY);
}

function dye(text: string, code: string, on: boolean): string {
  return on ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function reasons(runs: readonly RunReport[], code: string, on: boolean): string[] {
  return runs.map((run) => `  ${dye(run.run_id, code, on)}  ${run.tenant_name}  ${dye(run.reason, "2", on)}`);
}

function count(value: number, label: Outcome | "runs", on: boolean): string {
  if (label === "runs") return dye(`${value} runs`, "1", on);
  return dye(`${value} ${label}`, value === 0 ? "2" : `1;${COLOR[label]}`, on);
}

export function formatReport(report: DeliveryReport, outputPath: string, on: boolean): string {
  const { summary, runs, retries, unresolved } = report;
  const tenantWidth = Math.max(6, ...runs.map((run) => run.tenant_name.length));
  const retryRuns = unresolved.filter((run) => run.outcome === "retry");
  const escalations = unresolved.filter((run) => run.outcome === "escalate");
  const waiting = unresolved.filter((run) => run.outcome === "in progress");
  const retryLabel = retries.length === 0
    ? dye("Safe to retry: none", "2", on)
    : dye(`Safe to retry: ${retries.map((retry) => `${retry.run_id} (attempt ${retry.attempt_number})`).join(", ")}`, "1;33", on);
  const escalateLabel = escalations.length === 0
    ? dye("Escalate: none", "2", on)
    : dye(`Escalate: ${escalations.map((run) => run.run_id).join(", ")}`, "1;31", on);

  const lines = [
    `${dye("Wrote", "1;32", on)} ${dye(outputPath, "2", on)}`,
    "",
    `${count(summary.run_count, "runs", on)}: ${count(summary.delivered, "delivered", on)}, ${count(summary.retry, "retry", on)}, ${count(summary.escalate, "escalate", on)}, ${count(summary["in progress"], "in progress", on)}`,
    "",
    dye(`  ${"RUN".padEnd(6)}  ${"OUTCOME".padEnd(12)}  ${"TENANT".padEnd(tenantWidth)}  ATTEMPTS`, "2", on),
    ...runs.map((run) => `  ${run.run_id.padEnd(6)}  ${dye(run.outcome.padEnd(12), COLOR[run.outcome], on)}  ${run.tenant_name.padEnd(tenantWidth)}  ${run.attempts.map((attempt) => attempt.status).join(" -> ")}`),
    "",
    retryLabel,
    ...reasons(retryRuns, "33", on),
    escalateLabel,
    ...reasons(escalations, "31", on),
  ];

  if (waiting.length > 0) {
    lines.push(dye(`In progress: ${waiting.map((run) => run.run_id).join(", ")}`, "1;36", on), ...reasons(waiting, "36", on));
  }
  return lines.join("\n");
}
