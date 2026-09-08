# Working with migrations

## The rule that matters most

**Never pass a real database URL to `--shadow-database-url`.**

Prisma *resets* whatever database that flag names — it drops every table so it
has clean scratch space to replay migrations into. Pointing it at the live
Neon database destroys all data in it.

This happened twice on 2026-09-08. Both times the symptom was a confusing
`P3005 The database schema is not empty` from `migrate deploy`, because the
`_prisma_migrations` table had been dropped along with everything else. All
seed and test data was lost.

`--from-migrations` is the flag that *forces* a shadow database. Avoid it.

## Generating a migration

Diff the live database against the schema. This needs no shadow database and
only reads from the source:

```
cd apps/api
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel ./prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql
```

Check for drift with the same command plus `--exit-code` and no `--script`.

Prisma only loads `.env` when the working directory is `apps/api`. Running
these from the repo root with a `--schema` flag silently produces an empty
migration.

## Applying a migration

The developer running the machine applies migrations; the assistant generates
them and hands over the command.

```
cd apps/api
npx prisma migrate deploy
```

## If `_prisma_migrations` is missing

The database has tables but no migration history. Confirm the schema actually
matches first:

```
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code
```

If that reports no difference, baseline — this writes only to
`_prisma_migrations` and touches no data:

```
npx prisma migrate resolve --applied <migration_folder_name>
```

once per migration, in chronological order.

## Recovering data

Neon keeps a history window. In the Neon console: project → Branches →
`production` → Restore, then pick a timestamp before the loss. The window is
limited, so restore before doing anything else.
