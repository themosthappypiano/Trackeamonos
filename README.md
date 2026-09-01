# Tik Tik

A static Tik Tik product site and interactive time-tracking dashboard, hosted from the Trackeamonos repository.

The live page includes:

- The complete Tik Tik marketing page: positioning, focus problem, feature set, Telegram flow, pricing, and calls to action.
- An interactive dashboard demo with timers, time totals, projects, daily notes, completed-note archiving, presence check-in/out, drag-and-drop schedule blocks, and keyboard shortcuts.
- Browser-local demo persistence through `localStorage`; no database migration is required for this release.

## Files

- `index.html`: Tik Tik product page and dashboard markup
- `tiktik.css`: responsive product/dashboard styling
- `tiktik.js`: dashboard demo interactions and local persistence
- `app.js`, `styles.css`, `supabase/`: retained legacy Trackeamonos tracker source and schema history

## Local preview

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/`.

## Verification

```bash
node --check tiktik.js
node --test tests/task-order.test.js
```
