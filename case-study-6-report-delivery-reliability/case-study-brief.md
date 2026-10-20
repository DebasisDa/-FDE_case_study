# FDE Take-Home Case Study: Report Delivery Reliability

## Before you start

This exercise mirrors a real Forward Deployed Engineer (FDE) engagement: a customer brings you a genuine but partially-specified problem, and you're expected to (1) clarify/assume what's needed, (2) propose a solution, (3) build a working version of it, and (4) present and defend your approach to the customer (in this case, our panel).

**What we're evaluating:** how you handle ambiguity, the soundness of your design judgment, your ability to build a working solution under real constraints, how clearly you communicate your reasoning, and how you respond when your approach is challenged. We are **not** grading for a "perfect" or exhaustive solution — a well-reasoned, appropriately-scoped solution with clearly stated trade-offs is exactly what we want to see.

## The customer

**Meridian Payments** generates scheduled financial statements for its business customers. Their Head of Platform Reliability, Sam Okafor, reached out with the following ask:

> "Every so often a tenant's scheduled report just... doesn't show up, and we only find out when they email asking where it is. Our job runner logs every attempt with a status, but nobody's proactively watching it. I want something that looks at our job history, figures out which report runs actually never succeeded, and — ideally — automatically retries the ones that are safe to retry, before a customer ever notices.
>
> What counts as 'failed' isn't totally consistent in our logs, honestly — that's part of the mess I'm hoping you can help untangle."

**Note:** Sam's ask is intentionally incomplete. You will need to decide things like: which status values actually represent a failure, how many retries is reasonable before escalating to a human, and how this approach would need to change as the number of tenants and reports grows. **Document whatever assumptions you make.**

## What we're providing you

- A seed dataset of realistic (synthetic) job-attempt logs across 6 tenants and 12 logical report runs over a 2-week period.
- A minimal starter repository scaffold with basic failure-detection and retry helpers, so you're not starting from a completely blank page.
- *(See `starter_kit/` alongside this brief.)*

## What you have full freedom on

- **Language/stack** — use whatever you're most productive in.
- **Scope** — you decide what's in v1 versus "future work." A smaller, well-reasoned scope beats an ambitious, half-finished one.
- **Retry policy specifics** — pick reasonable defaults and state your reasoning; there's no single "correct" number we're looking for.

## Time expectation

We expect this to take **roughly 3-4 focused hours**, with a full week of calendar time to fit it in. If you're well past 4-5 hours, **stop** — use your README to describe what you'd tackle next.

## Required deliverables

1. **`SOLUTION_DESIGN.md`** (1-2 pages): the problem restated in your own words, your assumptions, your proposed approach, the trade-offs you considered, and what you'd do with more time/data/budget.
2. **Working implementation** — should run end-to-end against the provided dataset and produce a clear "here's which report runs never actually succeeded, and why" view.
3. **`README.md`** — how to run it, known limitations.

## Optional bonus track (not required, never penalized if skipped)

You're welcome to explore an AI-powered enhancement — for example, using an LLM to categorize the likely root cause of a failed run from its logs (e.g., "repeated timeouts suggest a performance/resource issue rather than a data problem"). This is a **plus signal**, not a gate.

## What happens after you submit

We'll review your submission ahead of a **30-45 minute live session**: a walkthrough of your design doc and a short demo, followed by Q&A, including "what if..." questions and the occasional new constraint introduced mid-conversation.

## Submission

Send us a link to your repository (or a zip archive) containing your code, `SOLUTION_DESIGN.md`, and `README.md`.
