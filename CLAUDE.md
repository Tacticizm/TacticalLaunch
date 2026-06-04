# TACTICAL LAUNCH — Project Briefing

Single-file mobile web golf distance & trajectory tracker. Premium dark-mode UI, feels native when saved to home screen.

---

## Files

| Path | Purpose |
|---|---|
| `E:\Claude\tactical-launch.html` | **Source of truth — always edit this file first** |
| `E:\Claude\TacticalLaunch\index.html` | Git repo copy — sync with `cp` before committing |
| `E:\Claude\TacticalLaunch\` | Git repo, tracks `origin/main` |
| GitHub | https://github.com/Tacticizm/TacticalLaunch |

### Deploy workflow
```bash
cp "E:/Claude/tactical-launch.html" "E:/Claude/TacticalLaunch/index.html"
cd "E:/Claude/TacticalLaunch"
git add index.html
git commit -m "description"
git push
```

---

## Tech Stack

- Single HTML file — no build step
- Tailwind CSS via CDN
- Vanilla JavaScript
- Google Fonts: Inter + Roboto Mono + Space Grotesk
- localStorage only (no backend)

---

## Data Model

**localStorage key:** `tl_v2`

**Shot object schema:**
```js
{
  id:    number,   // unix ms timestamp (used as unique ID)
  ts:    number,   // unix ms timestamp (same as id on new shots)
  club:  string,   // see CLUBS list below
  lie:   'tee' | 'grass',
  carry: number,   // yards (required)
  speed: number,   // mph (required)
  hang:  number | null,  // seconds (optional)
  apex:  number | null,  // feet (optional)
  curve: number | null,  // yards, negative = left, positive = right (optional)
}
```

**Clubs:** `['Driver','3 Wood','4 Hybrid','5 Iron','6 Iron','7 Iron','8 Iron','9 Iron','PW','GW','SW']`
- Always spaces, never hyphens
- normalizeShot() converts legacy hyphenated names on import

---

## Architecture

### Theme System
Two themes share 100% of JS logic. Only render functions differ.

**`S.theme`** — persisted to `localStorage` key `tl_theme`
- `'orbital'` — circular keypad, bar chart analytics, left-stripe feed, sky blue (#38BDF8) accent
- `'classic'` — 3-col rectangular keypad, stat table analytics, compact feed, green (#10B981) accent

**Switching:** `switchTheme('orbital' | 'classic')` — toggles `#theme-orbital` / `#theme-classic` divs

**Theme-prefixed DOM IDs:**
- Orbital: `o-box-carry`, `o-val-carry`, `o-clubBar`, `o-feed`, `o-statsGrid`, etc.
- Classic: `c-box-carry`, `c-val-carry`, `c-clubBar`, `c-shotList`, `c-statsGrid`, etc.

### Shared State Object `S`
```js
{
  club, lie, focus, tab,
  vals: { carry, speed, hang, apex, curve },  // raw string inputs
  shots: [],          // normalized shot array
  editingId: null,    // id of shot being edited, or null
  theme,              // 'orbital' | 'classic'
  metric: false,      // false = US units, true = metric
  pendingDelete: null // id awaiting delete confirmation
}
```

### Key Functions
| Function | Purpose |
|---|---|
| `normalizeShot(s)` | Converts any legacy shot format to current schema |
| `migrateAndLoad()` | Boot: reads both `tl_v2` and `tactical_launch_history` (Gemini legacy key), merges, normalizes |
| `setFocus(field)` | Sets active metric field for keypad input |
| `kp(key)` | Keypad handler — keys: '0'-'9', '.', '-', 'back', 'clr' |
| `setLie(lie)` | Updates lie toggle in both themes |
| `submitShot()` | Validates, saves new shot OR updates existing (edit mode) |
| `editShot(id)` | Loads shot into inputs, enters edit mode |
| `cancelEdit()` | Exits edit mode, clears inputs |
| `requestDelete(id)` | Opens delete confirmation modal |
| `confirmDelete()` | Executes pending delete |
| `setTab(tab)` | Sets analytics filter: 'all' | 'tee' | 'grass' |
| `calcStats(shots)` | Computes avg + best per metric |
| `toggleUnits()` | Toggles US/Metric, persisted to `tl_units` |
| `exportData()` | Encodes shots as Base64 string, copies to clipboard |
| `importData()` | Decodes Base64 string (supports both current + Gemini encoding) |
| `renderAll()` | Full re-render of both themes |
| `toast(msg, type)` | Shows top-center toast: type = 'ok' | 'err' |

---

## Color Palettes

### Orbital Theme
```
--bg:     #07080E  (near-black background)
--surf:   #0D0E19  (card surface)
--raised: #141526  (elevated elements)
--frame:  #1C1E32  (borders)
--lime:   #38BDF8  (sky blue — main accent, NOT green despite var name)
--tee:    #3B82F6  (blue — tee shot indicators)
--grass:  #4ADE80  (green — grass shot indicators)
--orange: #FF5500  (edit badge, secondary)
--red:    #FF1F3D  (danger/delete)
--mid:    #4E5275  (mid-gray text)
--text:   #DDE0F5  (primary text)
```

### Classic Theme
```
background: #121214
cards:      #1E1E22
borders:    #2D2D34
green:      #10B981  (primary accent)
purple:     #6366F1  (secondary, edit state)
tee:        #3B82F6  (blue)
grass:      #4ADE80  (green)
red:        #EF4444
```

### Analytics Bar Colors (per metric)
```
carry: #34D399  (soft emerald)
speed: #7B6EFF  (violet)
hang:  #F59E0B  (amber)
apex:  #06B6D4  (cyan)
curve: #FF3EA5  (pink)
```

---

## Unit Conversion

When `S.metric = true`:
- Carry/Curve: yards → meters (× 0.9144)
- Speed: mph → kph (× 1.60934)
- Apex: feet → meters (× 0.3048)
- Hang: always seconds (no conversion)

Persisted to `localStorage` key `tl_units` ('1' = metric, '0' = US)

---

## Import/Export

**Export encoding:** `btoa(unescape(encodeURIComponent(JSON.stringify(shots))))`

**Import decoding:** tries current format first, falls back to `JSON.parse(atob(raw))` for Gemini legacy exports

**normalizeShot() handles these legacy field name variants:**
- `distance` / `carryDistance` / `yards` → `carry`
- `ballSpeed` / `mph` / `velocity` → `speed`
- `hangtime` / `hangTime` / `airTime` → `hang`
- `height` / `peakHeight` / `maxHeight` → `apex`
- `deviation` / `lateral` → `curve`
- Club names with hyphens → spaces (e.g. `3-Wood` → `3 Wood`)
- String timestamps → unix ms via `new Date(s.timestamp).getTime()`
- `ts` = `id` fix: if all shots share the same `ts` it means they were bulk-stamped at export time — **this is NOT auto-fixed in normalizeShot, it must be manually applied**

**Known timestamp bug in old exports:** Some exports have `ts = [export timestamp]` for every shot instead of per-shot times. Fix: `shots.map(s => ({...s, ts: s.id}))` then re-export.

---

## Modals

| ID | Type | Purpose |
|---|---|---|
| `#dataModal` | Bottom sheet | Export/Import data portability |
| `#deleteModal` | Centered | Delete confirmation |
| `#themeModal` | Centered | Theme picker (Orbital / Classic) |

All use `.modal-ov` class + `.open` class toggle for show/hide animation.

---

## Known Issues / TODO

- The `--lime` CSS variable is named "lime" but holds sky blue `#38BDF8` — confusing name, works fine
- No offline/PWA service worker yet (app still requires network for Tailwind CDN + Google Fonts)
- GitHub Pages URL: enable at Settings → Pages → main branch to get `https://tacticizm.github.io/TacticalLaunch/`
- Android Studio WebView wrapper: discussed but not built yet — user plans to revisit

---

## Session History Summary

Built from scratch in one session:
1. Initial build — single-file app, orbital theme only
2. Redesign — new color palette (sky blue + teal/green), circular keypad, bar chart analytics
3. Club names updated — spaces not hyphens, 4 Hybrid instead of 4 Iron
4. Tee = blue / Grass = green color coding
5. Import compatibility — normalizeShot(), dual-format decoder
6. Classic theme added — from Gemini-generated reference file
7. Theme system — shared JS, dual HTML, theme picker modal
8. US/Metric toggle — shared across both themes
9. Delete confirmation modal — added to both themes
10. Data migration — merges legacy `tactical_launch_history` key on boot
11. Timestamp bug fix — identified and fixed bulk `ts` issue in imported data
