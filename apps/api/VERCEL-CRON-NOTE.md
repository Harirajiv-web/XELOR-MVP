# Why ACHILES runs daily here, not hourly

`vercel.json` schedules `/api/v1/internal/platform-health/run` at `30 0 * * *` — once a
day. The product intends **hourly**, and `docs/01-platform/` describes it that way.

The reason is the hosting plan, not the design: **Vercel Hobby accounts allow one cron run
per day per job**, and a deploy carrying `0 * * * *` is rejected outright with
`deploy_failed` before anything ships. That is what this file exists to record, because the
next person to read the schedule will otherwise assume the hourly figure in the docs is
wrong.

Nothing else changes. ACHILES's five probes, its tenant-fenced append-only history and its
`platform_health.overview.read` permission boundary are all unchanged — only how often the
scheduled run fires. A manual run through the console is unaffected, and that is what the
demo actually uses.

**On a Pro plan, restore it:**

```json
{ "path": "/api/v1/internal/platform-health/run", "schedule": "0 * * * *" }
```

The outbox drain is genuinely daily by design on this deployment and needs no change: the
demo world is seeded in one pass and nothing accumulates between presentations.
