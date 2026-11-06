# The Tot War — Playable Demo (Vertical Slice)

A real-time third-person Dark Souls-like on a dark-red 3D chessboard.
You are **one white pawn** rebelling against the king. This demo is a
**vertical slice** — one board, 3 waves + the Queen boss — not the full game.

Reference: **Pawned Souls** (Mika / devmika) — the game in the TikTok video
the project is inspired by. Tot War is *not* Pawned Souls: its headline
systems are the diagonal-only sword, the Soul-dash, and the capture-the-Queen
choice (see "Design decisions" below).

## How to run

```bash
cd the-tot-war
python3 -m http.server 8000
# then open http://localhost:8000 in a desktop browser (Chrome/Edge/Firefox)
```

No build step, no `npm install`. The only external dependency is
**Three.js 0.160.0**, loaded from the jsDelivr CDN via an import map in
`index.html` — so the first load needs internet. Everything else (board,
chess pieces, sounds) is procedural code; there are no image, model or
audio files.

### GitHub Pages

Push this folder to a repo and enable **Pages → Deploy from a branch →
`main` / `/ (root)`**. The game is a static site, so it just works.
(Repo already exists: `laoban-makeyourich/the-tot-war` — public, empty.)

## Controls

| Input | Action |
|---|---|
| W A S D | Move (camera-relative) |
| Mouse | Orbit camera — click the game to lock the pointer |
| Left mouse | Sword slash — **only hits on the two forward diagonals** |
| Right mouse | Shield / parry (timed parry stuns + gives Souls) |
| Space | Dodge roll (i-frames — briefly invulnerable) |
| Shift | Sprint (drains stamina) |
| H | Heal (+50 HP, 2 charges per wave) |
| F | Soul-dash — dash in the movement pattern of the last killed piece |
| Esc | Pause |

## What is in the demo

- **Wave 1** — 3 black pawns. **Wave 2** — Knight + Bishop + 2 pawns.
  **Wave 3** — Rook + Bishop + Assassin-Knight. **Final** — **THE QUEEN,
  900 HP** (AoE ground circles, line attacks, sword rain from above
  below 50% HP).
- **Diagonal-only attack (core identity).** The sword hits inside two
  50°-wide cones centred on the forward diagonals. Enemies straight
  ahead take **no damage** — a faint gold cone flashes on every slash
  so the rule can be learned, and the tutorial says it outright.
  - *Honest note on the brief:* the brief says "±50° around each
    diagonal". Taken literally that would cover straight ahead (45°
    away from a diagonal) and delete the rule entirely, so the demo
    reads it as a **50°-wide cone (±25° around each diagonal)**,
    leaving a 40° dead zone straight ahead. If the owner wants a
    different width, change `CONFIG.diagonalConeWidthDeg` — one line.
- **Stamina** governs attacks, rolls, blocks and sprint; hitting 0
  leaves you vulnerable for ~1.2s. **HP + 2 heals per wave.**
- **Attack-token rule (mandatory):** at most **2 enemies** may attack
  at once; the rest circle or wait on cooldown. This is what makes
  1-vs-many fair in real time.
- **Telegraphs for every dangerous attack:** glowing circle / line /
  tile + wind-up + WebAudio beep. Blue = parryable, red = must dodge.
- **Soul-dash:** killing an enemy grants its Soul (max 1 held).
  F spends it — Knight = L-blink, Rook = straight charge,
  Bishop = diagonal dash, Queen = omni-dash. This replaces the old
  turn-based 1-use card.
- **Push-back:** a slash knocks an enemy back; hitting the board edge
  or another enemy deals **+1 bonus damage** (floating number).
- **Promotion ("phong vương"):** after clearing a wave, a glowing gold
  tile lights up on the far rank. Step on it to fully heal and gain a
  **x1.5 damage buff** for the next wave.
- **Queen capture choice (LOCKED decision):** on defeating the Queen
  she is **not killed** — a choice screen appears: **Bắt sống Hậu**
  (True ending) vs **Kết liễu Hậu** (Revenge ending). Win screen:
  **CHECKMATE**.
- **Death:** you respawn at the start of the current wave. Unspent
  Souls drop where you died — walk over them to recover them.
- **Timer** counts up (top centre), **boss HP bar** (bottom centre),
  enemy deaths shatter into fragments.

## Design decisions — LOCKED vs temporary default

| Item | Status |
|---|---|
| Real-time third-person soulslike (not turn-based) | **LOCKED** (user's decision, 2026-11-06) |
| Diagonal-only sword attack | **LOCKED** (core identity) |
| Queen = 900 HP boss, captured alive when exhausted (ch. 3) | **LOCKED** |
| King = final boss (ch. 4) | **LOCKED** (role only — not in this demo) |
| Soul-dash replacing the 1-use card | **LOCKED** |
| Attack-token cap = 2 | **LOCKED** (fairness rule) |
| Player HP 100, sword damage 30, heal +50 ×2/wave | Temporary default — tune in `CONFIG` |
| Queen 900 HP / ~30 clean hits | **LOCKED number from the video**, but fight length must be playtest-checked (see plan doc) |
| Enemy HP: pawn 30, knight 60, bishop 50, rook 80, assassin 50 | Temporary default — tune in `CONFIG` |
| Stamina costs, telegraph times, i-frame durations | Temporary default — tune in `CONFIG` |
| Engine: Three.js 0.160.0, plain static site | Choice for this demo — Codex may propose Unity later, but the *design* above is engine-independent |
| No lock-on in this demo | Deliberate cut for the slice (camera stays behind the pawn) |

## What is NOT in the demo yet

- **King final-boss fight** (chapter 4) — the demo ends at the Queen choice.
- Shop / gold economy, chapters 1–4 full structure (20 levels / 5 chapters
  is an *estimate*, not a commitment — see the plan doc).
- Terrain: teleport gates, castle gates, river.
- Weapons: knife / scarce gun (planned as a limited-ammo secondary).
- Multiple-endings persistence beyond the Queen choice text.
- Lock-on camera, gamepad support, mobile controls, sound effects beyond
  WebAudio beeps, settings menu.
- **Known limitation, stated honestly:** the graphics are procedural
  LatheGeometry/box chess pieces with a stylised box-and-cone Knight —
  handsome at game distance, but not the sculpted models in the Pawned
  Souls video. If the owner wants that look, the pieces in
  `makePieceMesh()` / `PIECE_BUILDERS` are the single place to swap in
  real GLTF models later.

## Code map (for Codex — keep it to these files)

```
the-tot-war/
  index.html      — page shell, HUD, all screens, import map (Three.js CDN)
  src/main.js     — the whole game (~1300 lines, one module)
  README.md       — this file
  .gitignore
```

`src/main.js` structure, top to bottom:

1. **`CONFIG`** — every tunable number. Change balance here, never in logic.
2. DOM helpers + screens, **WebAudio beeps** (`sfx`).
3. Three.js scene: lights, fog, **8×8 board**, promotion tile.
4. **Procedural pieces** (`makePawnMesh` … `makeKnightMesh`,
   `PIECE_BUILDERS`) — swap here for real models.
5. Player (hero pawn + sword + shield + diagonal cone hint), input,
   pointer-lock camera.
6. **Telegraphs**, projectiles, shatter particles, floating numbers.
7. Enemies: factory + **state machine**
   (`approach → windup → attack → recover`, plus `circling` when no
   token is free, `jumping` for Knight/Assassin, `stunned` after parry)
   and the **Queen boss script** (`updateQueen`).
8. Player actions: `tryAttack` (diagonal-cone test is
   `isInDiagonalCone`), `tryDodge`, `tryHeal`, `trySoulDash`,
   `damagePlayer` (parry/block/i-frames live here).
9. Waves, promotion, death/respawn, tutorial steps, HUD, screens.
10. `animate()` — the main loop.

Rules Codex must not silently change (they are the game's identity):
diagonal-only attack, token cap 2, Soul-dash patterns, Queen captured
(not killed), promotion tile after each cleared wave. If a rule needs to
change, say so in the plan doc first — do not just edit the code.

## Verification done (2026-11-06, by the builder)

- `node --check src/main.js` — syntax OK.
- Local server test: `python3 -m http.server` → `curl` returns
  **HTTP 200** for `/` and the Three.js CDN URL is reachable (200).
- Code re-read pass: fixed 5 real bugs found on review (Queen melee
  never landing, wave-clear never triggering after the last kill,
  cone-hint wedges pointing the wrong way, a missing
  `Vector3.distanceToSegment` method, and a pointer-lock helper that
  called itself).
- Mental playtest of a full run: title → Wave 1 (3 pawns, diagonal
  slashes) → promotion tile → Wave 2/3 → Queen (AoE + lines, ~30 hits)
  → choice screen → CHECKMATE. Player can die (enemy damage, Queen
  AoE) and respawns at the wave start.

**Not verified:** no headless-browser playtest was available in the
build environment, so the game has not been *played* end-to-end with
real input yet. Before trusting it, open it in a desktop browser and
play Wave 1: confirm the pawn moves, the slash hits diagonally but
misses straight ahead, the roll has i-frames, and the Queen fight is
beatable in a few minutes. If anything feels off, the first knobs to
turn are all in `CONFIG` at the top of `src/main.js`.
