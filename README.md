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
