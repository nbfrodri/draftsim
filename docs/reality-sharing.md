# Reality sharing

DraftSim realities (continuous franchise timelines) can be shared in two ways:

## 1. Full JSON export (`.draftsim-reality.json`)

From **Realities → Saved realities → Export**, you get a JSON file with:

- The reality's live season snapshot (compact-encoded tournaments)
- That reality's private **Hall of Seasons** history
- Franchise metadata (name, year, aging flag)

Import the file with **Import (.json)** on the Realities hub. Existing realities with the same `id` are replaced.

Works offline on web and in the Tauri desktop build (native save/open dialogs).

## 2. Share codes (`REAL1:`)

Share codes are compressed, URL-safe strings — the same deflate + base64 pattern as tournament `TOUR1:` codes.

### Export a code

On any saved reality card, click **Copy REAL1 code**. The hub copies a string like:

```
REAL1:eJxLzk...
```

Paste it into chat, Discord, a gist, or a community manifest entry.

### Import a code

1. Open **Realities → Import share code**
2. Paste the full `REAL1:` string (or a raw JSON export)
3. Confirm — the reality is upserted by its internal id

Share codes and JSON exports are equivalent payloads; codes are just smaller for paste-sharing.

## Community gallery

The **Community gallery** on the Realities hub reads `public/community-realities/manifest.json` — a curated list of titles, descriptions, tags, and optional embedded `REAL1:` codes.

To add an entry:

1. Export your reality as JSON or REAL1 code
2. Edit `manifest.json` and append an object:

```json
{
  "id": "my-reality-slug",
  "title": "My LCK Dynasty Run",
  "author": "YourName",
  "description": "Short blurb for browsers.",
  "tags": ["LCK", "dynasty"],
  "code": "REAL1:...",
  "featured": false
}
```

3. Omit `code` if you only want a placeholder card; users can still paste codes manually.

There is no backend — the gallery is a static index shipped with the app. Host larger JSON files separately and link via share codes for lightweight distribution.

## Tips

- Share codes can be large for long timelines (many archived seasons). JSON files are easier for very heavy saves.
- Realities never mix with the one-off **Season mode** Hall — each reality keeps its own history slot.
- After import, use **Resume** to play the imported year; switch realities from the hub anytime.
