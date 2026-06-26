# Simulation & Event-System Ideas

A backlog of ways to make the match simulation and its event feed richer, more
varied, and more alive. Grouped by category. Each idea is tagged with its
**feedback polarity** — the single most important design axis now:

- **`+`  positive feedback** (snowball): amplifies the leader. *Must* be paired
  with a counter (scale `comebackBias`, add a negative-feedback beat) or the
  event feed re-saturates and games read one-sided.
- **`–`  negative feedback** (comeback): helps the trailing team. These are
  scarce and valuable — add them alongside any `+`.
- **`=`  neutral**: doesn't bias the leader (either side, or pure flavor).

Effort is rough: **S** = a few lines / reuse an existing type, **M** = a new
phase or link, **L** = a new subsystem.

The time-ordered engine makes adding events cheap: `tl.schedule(time, resolve)`,
roll the time up front, read live state in `resolve`. Most ideas below are S/M.

---

## ✅ Shipped (June 2026 batch)

New event beats: **tower dive** (`dive`, new type), **poke/siege** (`siege`, new
type, comp-gated), **Teleport flank** (skirmish), **early cheese** (invade),
**disengage/peel** (negative), **last-stand** (negative). Links/polish:
**grubs → lane snowball**, **roam → tower pressure**, **CC/wombo → bigger fight**,
**splitpush → 4v5 mid damp** (negative), **playstyle → more ganks**
(earlyAggroBias extended), **objective-edge surfacing** in the teamfight line,
**first-tower gold bonus**. Deeper: **season Records** (longest/fastest game,
best MVP game, biggest swing) on the recap panel; **pentakills** reach every
carry role. Feed stays two-sided (loser ≥ ~28% even at +26 scoreBias);
calibration de-fragilized (synthetic cases now validate the Monte-Carlo forecast,
which doesn't drift as content is added).

Already substantially present (no separate work needed): voidgrub shred spike
(grubs feed tower pressure), win-condition funnel, vision → deny objectives
(`stealChance` map-control term), tilt/morale (momentum), engage-initiation
naming (`nameActualFragger`), objective-stacking urgency (phases cluster at
spawns).

Also shipped (follow-up): **player-form → outplay/pentakill** (form was already
threaded into `simulateMatch`; now reaches the highlight plays via `formEdge` /
`formWeightedLane` / form-weighted `pentakiller`); **MVP leaderboard** ("Most
MVPs" by roster slot) on the recap panel; **anti-streak mean-reversion** in the
event-side roll (scoped to low-stakes plays) so the feed no longer reads as one
team's uninterrupted run — worst mid-game same-side run cut 23→14, loser share
~40%, outcomes preserved.

Final batch (all remaining shipped): **champion-mastery → highlight plays**
(pool comfort merged into the timeline highlight-form via `highlightForms`);
**champion-signature plays** (Thresh hook / Lee insec / Akali shroud / Malphite
wombo etc. flavor the outplay, pick and teamfight engage — fires ~30%/game for a
signature team); **per-game key-moments strip** (top 5 plays above the log once a
game ends); **map-control overlay** on the momentum chart; **rivalries** panel
(most-played head-to-heads + record); **career arcs** (Breakout/Rising/Steady/
Slump/Decline badge per player in My Team). The Records / MVP / Pentakill recap
panels were enriched: Records gained Biggest Stomp + Fastest Pentakill + a games
headline; MVPs show avg KDA + skill tier; Pentakills show lane + fastest-minute +
unique-champion count. Everything is persistence-safe (recap fields that survive
save/load) and the full suite + build stay green.

Nothing from this document is left open.

---

## 1. New event beats

| Idea | What happens | Polarity | Effort |
|---|---|---|---|
| **Inhibitor respawn / mega-minion wave** | An open inhib respawns; the mega-minion wave is a tempo beat (the sieging team pushes, or the wave is cleared). | `+` | M |
| **Scuttle 2v2** | Junglers + a laner each fight over scuttle — a real early skirmish, not just a gold pickup. | `=` | M |
| **Top-lane Teleport flank** | A top-laner TPs into a fight on the other side of the map for a flank engage — swings a contested fight. | `=` | M |
| **Mid → bot collapse (dive)** | Mid roams bot and the team dives the tower — a 3-man play with a kill or two, distinct from a gank. | `+` | M |
| **Splitpush 1-3-1 standoff** | The split team pressures a side lane while the 4 hold mid — map tension, cross-map trades (extends objective-trade). | `=` | S |
| **Control-ward catch** | A pink ward in a key bush sets up a pick later (links to vision-pick). | `+` | S |
| **First-tower bonus** | Real LoL: first turret grants a team gold bonus. The first-tower event awards extra (a small, real first-tower-gold lead). | `+` | S |
| **Turret tiers** | Model outer → inner → inhib turrets with escalating gold instead of generic "tower" — the map state reads like a real siege. | `=` | M |
| **Herald eye charge** | The Herald charge → a specific tower break (the "Herald ate the tower" beat), not just tower pressure. | `+` | S |
| **Voidgrub shred spike** | 6 grubs = a visible tower-melt moment (a tower falls fast right after). | `+` | S |
| **Cheese / proxy / lvl-2 all-in** | An early off-meta gamble: a proxy Singed, a lvl-1 cheese, a lvl-2 tower dive — high-variance early. | `=` | M |
| **Funnel comp play** | A smite-ADC funnel: the jungler feeds the carry — concentrates the snowball on one champ (extends the win-condition funnel). | `+` | M |
| **Poke-siege war of attrition** | A siege comp chips a tower with poke over a window (multiple small gold/health ticks) — the "they can't engage, they can't disengage" beat. | `+` | M |
| **Disengage / peel survival** | The team that gets dove but PEELS and survives — a defensive non-kill beat (a `–` cousin of the comeback stand). | `–` | S |
| **Engage initiation** | The hook/flank/wombo that *starts* a teamfight — surfaces WHO engaged (Thresh hook, Malphite ult) before the fight resolves. | `=` | M |
| **Flash-cooldown vulnerability** | A laner who used Flash is catchable for ~5 min → a higher pick chance against them. | `+` | M |
| **Last-stand nexus defense** | The losing team repels the final push once (delays the end), then loses — a dramatic stay of execution. | `–` | S |

## 2. New causal links (state → state)

| Idea | The chain | Polarity | Effort |
|---|---|---|---|
| **Lane counter → repeated solo kills** | A hard lane counter (high `laneMatchup`) snowballs that lane *harder* — more solo kills, bigger lead. | `+` | S |
| **Comp scaling → game length** | A scaling comp actively *drags* the game (raises duration); an early comp tries to end fast. Currently duration is fixed pregame. | `=` | M |
| **Recall timing → item spike → fight** | A back after a kill → an item → the next fight tips. Tie the recall to the spike window. | `+` | M |
| **CC chain → wombo wins harder** | A high-lockdown comp (already in `combatRatioBlue`) gets a bigger *kill spread* when it lands an engage, not just a higher win chance. | `+` | S |
| **Splitpush → 4v5 mid** | While the splitpusher pressures the side, the team is down a body mid → the mid objective is harder for them (the splitpush trade-off). | `–` | M |
| **Wave management → dive setup** | A crashed wave → a tower dive in that lane shortly after (the wave-crash → dive chain, currently only feeds tower pressure). | `+` | S |
| **Region / team playstyle** | Each team has an early-aggressive vs scaling tendency that biases *which* events they generate (LPL dives, LEC scales). | `=` | M |
| **Player form → outplay rate** | A hot-streak player (existing `playerForm`) is more likely to pull off an outplay / get the pentakill. | `+` | M |
| **Champion mastery → performance** | A player's pool-tier comfort (mains vs flex) nudges their lane/fight performance — wires the tiered pools into the sim, not just the draft. | `+` | M |
| **Tilt / morale** | A team that loses several fights in a row tilts (worse next fight); a comeback restores morale. Strong `+`, so it *needs* the comeback system scaled up. | `+` | M |
| **Objective stacking → urgency** | When soul point / Elder is about to spawn, fights cluster around the pit (the spawn timer *forces* the teamfight). | `=` | M |
| **Vision lead → deny enemy objectives** | A team with deep vision denies the enemy's objective setups (lower enemy steal + pick chance), not just their own picks. | `+` | S |

## 3. Polish existing events/links

| Existing | Make it richer | Polarity | Effort |
|---|---|---|---|
| **Grubs** | Already feed tower pressure — also nudge `laneLead` (Touch of the Void helps the laners shove). | `+` | S |
| **Herald** | Currently tower pressure + a tower — make the eye *charge* a visible "Herald breaks mid" beat. | `+` | S |
| **Atakhan** | Voracious/Ruinous are wired but barely surfaced — show the variant's effect in the feed and lean into Ruinous revives. | `=` | S |
| **Roam** | A successful roam → a follow-up tower/dive in that lane (roam → collapse → tower chain). | `+` | S |
| **Power-spike** | Already opens a play window — add an explicit follow-up *event* (the spike → the fight it caused), not just a bias. | `+` | M |
| **Multikill flair** | Penta/Rampage exist — add Double/Triple/Quadra flair for partial multikills (cosmetic). | `=` | S |
| **Objective fight edge** | Soul/Baron/Elder edges are modest — surface them in the feed ("Elder-empowered, Blue wins the fight"). | `=` | S |

## 4. Deeper systems (bigger, higher payoff)

- **Per-player season stats (L).** Extend the pentakill board into a full player
  leaderboard: KDA, MVPs, kill participation, best games — a "stats" page for the
  season. The pentakill plumbing (recap → season aggregation) is the template.
- **Records & milestones (M).** Track and display season records: longest game,
  fastest win, biggest comeback (win-prob nadir → win), most kills in a game,
  bloodiest match. A "Hall of Records" panel.
- **Champion-signature plays (L).** A champion's *identity* drives a flavored
  event: a Thresh hook pick, a Lee Sin insec, a Yasuo–Malphite wombo, a Katarina
  reset-fest. Keys off archetype + alias (the meta data already exists).
- **Rivalries (M).** Teams that meet often accrue head-to-head history; a rivalry
  match gets extra tension (volatility) and a feed callout.
- **Player career arcs (L).** A player has form, a breakout game, a slump, a
  veteran decline — narratives that surface across a season. Builds on the
  existing `playerForm` + `playerDevelopment` season options.
- **Late-game tension model (S).** Win-prob volatility should *rise* late (one
  fight ends it) — the swings feel more dangerous as the game drags, matching the
  Baron-throw / Elder-steal stakes.

## 5. UI / surfacing (the engine is rich; show it)

- **Per-game key-moments strip (M).** A highlight reel of a game's 3–5 biggest
  plays (pentakill, biggest swing, the throw, the comeback) above the full log.
- **Season records / leaderboards page (M).** Pentakills (done), MVPs, most
  kills, best win rate — a browsable awards/records view.
- **State-over-time, fuller (M).** Map control + lane-lead charts (momentum is
  charted; these are tracked but not yet visualized).
- **Causal threading (M).** Visually link a setup play to its payoff in the feed
  (the "↳ off the pick" tag exists — extend it: gank→snowball, fight→Baron).

---

### Suggested order (balanced ledger)

If implementing in batches, alternate `+` and `–` so the feed stays varied:

1. **Polish trio + flair** (S, mostly `=`): grubs→lane, herald charge, roam→tower,
   double/triple/quadra flair. Low risk, immediate texture.
2. **Disengage/peel survival + last-stand defense** (`–`): two cheap comeback
   beats to bank negative feedback *before* the next `+` batch.
3. **Splitpush 1-3-1 + 4v5 mid** (`=`/`–`): makes the splitpush macro a real,
   self-balancing playstyle.
4. **Per-player season stats** (L): the highest-payoff system — turns the sim's
   per-pick KDA into a season-long story (pentakill board is the proof of concept).
5. **Records & rivalries** (M): cheap narrative wins on top of existing data.

Always re-check the **feed share** (loser ≥ ~30% in a lopsided game) and
**calibration** (mirror < 0.04; synthetic late cases are the closed-form
forecaster's known limit — Monte-Carlo is the accurate display value) after each
batch.
