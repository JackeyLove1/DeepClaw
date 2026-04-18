---
sidebar_position: 11
title: "Cron Internals"
description: "How DeepClaw stores, schedules, runs, and delivers cron jobs in the Electron + TypeScript runtime"
---

# Cron Internals

The cron subsystem provides scheduled task execution inside the Electron main process. It supports one-shot delays, recurring intervals, standard 5-field cron expressions, and absolute ISO timestamps.

This document describes the TypeScript implementation that lives in the current repository. It no longer reflects the old Python/Hermes `jobs.json` design.

## Key Files

| File | Purpose |
|------|---------|
| `src/main/agent/cron/service.ts` | High-level CRUD, validation, execution, delivery |
| `src/main/agent/cron/repository.ts` | SQLite persistence for `cron_jobs` and `cron_runs` |
| `src/main/agent/cron/scheduler.ts` | 30-second background tick, bounded concurrency, resume catch-up |
| `src/main/agent/cron/executor.ts` | Fresh runtime execution with skills injection and `cronjob` recursion guard |
| `src/main/agent/cron/schedule.ts` | Schedule kind detection and next-run calculation |
| `src/main/agent/tools/CronTool/index.ts` | Agent-facing `cronjob` tool |
| `src/main/index.ts` | Main-process startup, IPC registration, power-resume wiring |
| `src/shared/types.ts` | Shared IPC contracts and cron DTOs |

## Scheduling Model

Four schedule formats are supported:

| Format | Example | Behavior |
|--------|---------|----------|
| Relative delay | `30m`, `2h`, `1d` | One-shot, runs once after the given duration |
| Interval | `every 2h`, `every 30m` | Recurring, recomputed from the last completed run |
| Cron expression | `0 9 * * *` | Standard 5-field cron syntax |
| ISO timestamp | `2026-04-18T09:00:00Z` | One-shot, runs at the exact timestamp |

`detectScheduleKind()` and `computeNextRunAt()` in `schedule.ts` are the source of truth for parsing and rescheduling.

### Timezone Semantics

- Cron jobs default to the local machine timezone.
- Each job can persist an optional `timezone`.
- Cron matching is evaluated minute-by-minute in the target timezone.

## Public Surface

The agent-facing surface is a single `cronjob` tool with these actions:

- `create`
- `list`
- `update`
- `pause`
- `resume`
- `run`
- `remove`

The same service is also exposed through IPC:

- `cron:listJobs`
- `cron:listRuns`
- `cron:createJob`
- `cron:updateJob`
- `cron:pauseJob`
- `cron:resumeJob`
- `cron:removeJob`
- `cron:runJob`

`CronTool` delegates to `CronService`. The tool and IPC APIs do not implement separate business logic.

## Storage Model

Cron state is stored in the main SQLite database under `~/.deepclaw/deepclaw.db`.

### `cron_jobs`

Each row stores:

```json
{
  "id": "cron_...",
  "name": "Daily briefing",
  "prompt": "Summarize today's work queue",
  "schedule": "0 9 * * *",
  "scheduleKind": "cron",
  "timezone": "Asia/Shanghai",
  "state": "scheduled",
  "nextRunAt": 1776493200000,
  "lastRunAt": null,
  "sourceSessionId": "session_...",
  "deliver": "origin_session",
  "skills": ["productivity/powerpoint"],
  "script": null,
  "runCount": 0,
  "maxRuns": null,
  "misfirePolicy": "run_once_on_resume",
  "createdAt": 1776460800000,
  "updatedAt": 1776460800000
}
```

Job states:

| State | Meaning |
|-------|---------|
| `scheduled` | Active and eligible for future execution |
| `paused` | Suspended until resumed |
| `running` | Claimed by the scheduler or a manual run |
| `completed` | No future execution remains |

### `cron_runs`

Each execution writes a separate run record:

```json
{
  "id": "cron_run_...",
  "jobId": "cron_...",
  "triggerKind": "scheduled",
  "status": "success",
  "startedAt": 1776493200000,
  "finishedAt": 1776493204123,
  "linkedSessionId": "session_...",
  "outputPreview": "Cron Job: Daily briefing ...",
  "outputPath": null,
  "errorText": null,
  "model": "claude-sonnet-4-5",
  "inputTokens": 1234,
  "outputTokens": 456,
  "cacheCreationTokens": 0,
  "cacheReadTokens": 0,
  "nextRunAt": 1776579600000
}
```

The run table is the primary observability layer. Cron execution history is not modeled as ordinary chat sessions.

## Scheduler Runtime

`CronScheduler` runs in the Electron main process.

- Tick interval: `30s`
- Global concurrency: `2`
- Same job re-entry: disallowed
- Resume behavior: on startup or OS resume, due jobs are re-checked and at most one recovery execution is performed for each overdue schedule

### Tick Flow

```text
drain()
  1. Determine free worker slots (max 2)
  2. Claim due jobs in SQLite by moving state from scheduled -> running
  3. For each claimed job:
     a. Insert a running row into cron_runs
     b. Execute with a fresh AnthropicChatRuntime
     c. Deliver the result
     d. Increment runCount
     e. Compute nextRunAt from the finished time
     f. Move job back to scheduled or completed
     g. Finalize the cron_runs row
```

The repository performs due-job claiming in SQLite so the scheduler does not full-scan or rewrite a JSON file on every tick.

## Execution Model

Each cron run executes in a fresh runtime context:

- No prior conversation history
- No dependence on previous cron turns unless written to files or DB
- `cronjob` tool disabled during cron execution

`CronExecutor` creates an `AnthropicChatRuntime` with `createTools({ includeCronTool: false })` to prevent recursive scheduling from inside a cron run.

## Skill Injection

Cron jobs can attach installed skill ids through `skills`.

At execution time:

1. Installed skills are loaded from `~/.deepclaw/skills`
2. Requested skills are validated by id
3. Matching `SKILL.md` bodies are injected into the cron prompt in the configured order
4. The job prompt is appended after the injected skill context

This keeps cron prompts compact while still reusing bundled or user-installed workflows.

## Delivery Model

v1 supports two delivery targets:

| Target | Meaning |
|--------|---------|
| `origin_session` | Publish a `cron.delivery` chat event into the source session |
| `local_file` | Write Markdown output to `~/.deepclaw/cron/output/` |

### Origin Session Delivery

- Used when the job was created from a chat session or when `sourceSessionId` is provided
- Stored as a dedicated `cron.delivery` event
- Shown in the chat UI as a system-style transcript entry
- Not replayed into future model turns as ordinary assistant conversation

### Local File Delivery

- The service writes a timestamped `.md` file under `~/.deepclaw/cron/output/`
- The absolute path is stored on the `cron_runs` row

## Script Support

The data model reserves a `script` field for future preprocessors.

Current behavior:

- `script` is persisted as `null`
- Non-null script values are rejected during create/update
- There is no Python or shell pre-step in v1

## Optimization Notes

Compared with the old Python-style design, the current implementation is optimized in several ways:

- SQLite replaces full-file `jobs.json` rewrites
- Due-job claiming is indexed and transactional
- Execution history is split into `cron_runs` instead of overloading chat sessions
- Concurrency is bounded to avoid multiple heavy agent runs overwhelming the desktop process
- Origin-session delivery uses a dedicated event type instead of pretending to be a normal assistant turn
