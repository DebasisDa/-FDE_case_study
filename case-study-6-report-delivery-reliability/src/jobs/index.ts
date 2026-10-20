import fs from "node:fs";

export class JobLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobLogError";
  }
}

export interface JobAttempt {
  job_id: string;
  run_id: string;
  tenant_id: string;
  tenant_name: string;
  report_name: string;
  scheduled_at: string;
  status: string;
  attempt_number: number;
  duration_seconds: number | null;
  row_count: number | null;
}

const TEXT_FIELDS = ["job_id", "run_id", "tenant_id", "tenant_name", "report_name", "scheduled_at"] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function requiredText(row: Record<string, unknown>, field: string, index: number): string {
  const value = row[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new JobLogError(`Job at index ${index} is missing a non-empty ${field}.`);
  }
  return value.trim();
}

function optionalNumber(row: Record<string, unknown>, field: string, index: number): number | null {
  if (!(field in row) || row[field] === null) return null;
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new JobLogError(`Job at index ${index} has an invalid ${field}.`);
  }
  return value;
}

function parseJob(value: unknown, index: number): JobAttempt {
  const row = asRecord(value);
  if (!row) throw new JobLogError(`Job at index ${index} must be an object.`);

  const attemptNumber = row.attempt_number;
  if (typeof attemptNumber !== "number" || !Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new JobLogError(`Job at index ${index} has an invalid attempt_number.`);
  }

  const text = Object.fromEntries(TEXT_FIELDS.map((field) => [field, requiredText(row, field, index)])) as Pick<
    JobAttempt,
    (typeof TEXT_FIELDS)[number]
  >;

  return {
    ...text,
    status: typeof row.status === "string" ? row.status : "",
    attempt_number: attemptNumber,
    duration_seconds: optionalNumber(row, "duration_seconds", index),
    row_count: optionalNumber(row, "row_count", index),
  };
}

export function parseJobs(data: unknown): JobAttempt[] {
  const body = asRecord(data);
  if (!body || !("jobs" in body)) throw new JobLogError("Job log must be an object with a jobs array.");
  if (!Array.isArray(body.jobs)) throw new JobLogError("Job log field jobs must be an array.");
  return body.jobs.map(parseJob);
}

export function readJobs(inputPath: string): JobAttempt[] {
  if (!fs.existsSync(inputPath)) throw new JobLogError(`Job log not found: ${inputPath}`);
  try {
    return parseJobs(JSON.parse(fs.readFileSync(inputPath, "utf8")) as unknown);
  } catch (error) {
    if (error instanceof JobLogError) throw error;
    throw new JobLogError(`Could not parse JSON: ${inputPath}`);
  }
}
