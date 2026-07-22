# Trackeamonos

Static tracking app for shared profiles, tasks, habits, end-of-day checklist items, gratitude, XP, and streaks.

## Files

- `index.html`, `styles.css`, `app.js`: the static app
- `supabase/schema.sql`: Supabase tables and prototype RLS policies
- `render.yaml`: Render static-site config
- `loads/app-logo.jpg`: app logo

## Local Preview

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor before using real data. The current prototype uses public read/write policies and should be tightened before production.

For an existing database, apply `supabase/add-task-sort-order.sql` instead. It
adds and backfills `tasks.sort_order`, assigns new tasks safely, and installs a
transactional reorder RPC without changing `created_at`.

### Reorder tasks through the REST API

Send the complete ordered list of task UUIDs for exactly one profile:

```bash
curl "$SUPABASE_URL/rest/v1/rpc/reorder_tasks" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "PROFILE_UUID",
    "ordered_task_ids": ["FIRST_TASK_UUID", "SECOND_TASK_UUID"]
  }'
```

The list must contain every task belonging to the profile exactly once. The RPC
runs as the caller (`SECURITY INVOKER`), so existing task RLS policies apply. It
serializes inserts and reorders per profile, validates membership, and updates
the complete order in one transaction. Use an authenticated user's access token
in a browser; keep the service-role key only in trusted server-side tooling.
