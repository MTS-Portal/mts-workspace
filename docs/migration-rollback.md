# Migration rollback

Migrations are **forward-only**, idempotent (`create table if not exists`, `add column if not exists`,
`on conflict do nothing`, `do $$ ... exception when duplicate_object then null $$`), applied in filename
order, one transaction each, recorded in `_migrations`, run by `npm run db:migrate` / `npm run build`.

## Never destructive

No migration drops tables/columns or deletes production rows. Unknown financial data is `NULL`, never `0`.
Nothing renames existing roles or tenant identifiers in-place.

## Rolling back a bad migration

Because everything is additive, rollback is safe and does not lose data:

1. **Prefer roll-forward.** Write a new `00NN_*.sql` that corrects the issue (e.g. `drop table if exists <new_table>`,
   `alter table ... drop column if exists <new_col>`) for tables/columns *introduced by the bad migration*.
2. **Remove a committed migration that has not yet applied anywhere**: delete the file before deploy; nothing ran.
3. **A migration already applied in production**: `_migrations` has its name. To revert code, redeploy previous
   build; the additive schema is harmless. Do NOT manually `delete from _migrations`. Do NOT `reset production`.
4. **Restore data**: use Neon point-in-time restore / backups. Never `drop`/`truncate` as a rollback.

## Secret safety

No migration commits a credential. OAuth/API secrets live in the environment (`ZENDESK_OAUTH_CLIENT_SECRET`,
`BETTER_AUTH_SECRET`, `DATABASE_URL`, …) or in `integration_settings` at runtime; not in SQL files.

## This round's additive migrations

- `0087_routing_rules.sql`
- `0088_procurement_projects.sql`
- `0089_notification_preferences_schedule_events.sql`

Rollback for any = `drop table if exists <created tables>` in a new migration; none touch pre-existing tables.
0085/0086 (and everything ≤0084) are preserved.
