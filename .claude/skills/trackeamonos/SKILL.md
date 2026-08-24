---
name: trackeamonos
description: Workflow for making changes to the Trackeamonos app (static site at trackeamonos.onrender.com, backed by Supabase). Use whenever the user asks to add, change, or fix something in this app.
---

# Trackeamonos change workflow

Trackeamonos is a static shared-tracking app (`index.html`, `app.js`, `styles.css`) deployed on Render directly from the `main` branch of `github.com/themosthappypiano/Trackeamonos`. There is no staging environment or CI gate — pushing to `main` redeploys the live app.

## When the user asks for an app change

1. Make the change in the working tree as usual.
2. Commit directly to `main` and push, without asking for confirmation first — this repo's owner has pre-authorized that workflow. Use `git -c user.name="Jonas Alfonso" -c user.email="jonas@jonasalfonso.com" commit ...` if no git identity is configured for the repo (do not touch global git config).
3. Still show a short summary of what changed and why, same as any other commit.

Treat this as standing authorization to push for this repo specifically — it does not extend to other repos.

## When the change touches the database

Trackeamonos uses Supabase (Postgres). Schema changes are tracked as one-off migration files in `supabase/*.sql` (see `supabase/schema.sql` for the base schema and files like `add-like-jar-amount.sql` for incremental changes) — there is no migration runner, they're applied manually in the Supabase SQL editor.

Whenever a change requires a database migration:

1. Write the migration as a new file in `supabase/` following the existing naming pattern (`add-<thing>.sql`), and commit/push it with the code change as usual.
2. In the same reply, print the SQL to run, clearly marked, so the user can copy it and send it to Jonas to run in the Supabase SQL editor. For example:

   > **Send this SQL to Jonas to run in Supabase:**
   > ```sql
   > alter table public.profiles
   >   add column if not exists example_column text;
   > ```

Do not assume the migration has been applied — the app-level column/table may not exist in the live database until Jonas runs it.
