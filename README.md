# The Tot War — Playable Demo (TURN-BASED grid tactics)

**Turn-based tactics on an 8×8 chessboard.** You are **one white pawn**
rebelling against the king. Every piece occupies exactly one square and
moves square-to-square — no free roaming, no real-time combat.

> **2026-11-06 — direction correction.** The first build of this demo was
> a **real-time** third-person soulslike, copied from the TikTok video
> (Pawned Souls). That was the WRONG direction: the owner's original
> design was always turn-based, with movement on the board's squares
> ("game ban đầu là theo lượt", "di chuyển trên các ô của bàn cờ"). This
> file is the rebuild. The real-time code is gone; the board, the
> procedural pieces and the Queen-capture choice were kept.

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
`main` / `/ (root)`**. A `.nojekyll` file is included (plain static site —
Jekyll must stay off, it broke a Pages build once). Repo:
`laoban-makeyourich/the-tot-war` (public).

## Rules (the original design, implemented faithfully)

| Rule | How it works in the demo |
|---|---|
| Grid movement | 8×8 squares. Click a **green** square to move there, **red** to attack. Or W/A/S/D / arrow keys to step 1 square. The camera is a fixed angled top-down view of the whole board — no pointer lock, no free camera. |
| Pawn | **1 HP** (one hit kills), **1 damage** per attack. Moves **orthogonally 1 square**, attacks **diagonally 1 square, all 4 directions** — never straight ahead. |
| 2 actions per turn | Each player segment = **2 actions**. Move and attack share them (move 2×, attack 2×, or move+attack). HUD shows "Hành động còn lại: ●● (2/2)". Space / the button ends your segment early. |
| Interleaved turns | Turn order is **enemy 1 → player → enemy 2 → player → …**, NOT all enemies before the player. The HUD shows the live turn queue ("Lượt: Tốt → Mã → Tốt → Tượng…"). |
| Enemies by chess rules | Pawn moves 1 forward, attacks diagonally forward. Knight jumps in L. Bishop slides diagonally. Rook slides straight. Queen slides any direction. Assassin = Knight that L-jumps twice per turn. All enemies: **5 HP, 1 damage** (original numbers). |
| Enemy intent | Before an enemy acts, its target square stays **red for ~0.9s** so you can read the board. |
| Cards | Killing an enemy gives **that piece's card**. Click a card in hand to use it: it disappears immediately and grants that piece's movement for the **current player segment only** (e.g. as a Knight you move in L and no longer move 1 square + diagonal attack). Pawn card = +1 action this segment. Cards do **NOT** carry to the next wave. |
| Warnings | **3 per wave.** If you try to step onto a square an enemy can attack, the move is **stopped** with a warning and the warning count drops. After 3 are spent, the HUD says "Hết cảnh báo!" and no more warnings are given. |
| Push-back | An attack shoves the enemy 1 square away. If the square behind is the board edge or blocked by another piece, the pushed enemy takes **+1 damage**; if pushed into another enemy, **both** take +1. |
| Promotion ("phong vương") | A **random gold square** on the enemy side (rows 0–1). Attack it diagonally **3 times** to unlock, then **move into that exact square** (no auto-promotion) and choose a form — Mã / Tượng / Xe / Hậu. The form is kept **for that wave only**, with the new piece's movement fully adopted. |
| Gold & shop | Kill = 10–20 gold (pawn 10, knight/bishop 15, rook/assassin 20), clearing a wave = **+30 bonus**. Between waves a shop sells: **Giáp +1 HP (30), Hồi sinh (50), Dao +1 damage (40), Súng (60)** — gun shoots straight up to 3 squares and costs 1 action. |
| Queen boss | Final wave. Demo HP is **20** (see note below), she moves along queen lines, attacks adjacent squares, fires **line attacks** (range 4), and marks a **3×3 AoE** that explodes on her *next* turn — you get one full player segment to step out of the red squares. On defeat she is **not killed**: choose **Bắt sống Hậu** (True ending) vs **Kết liễu Hậu** (Revenge ending), then CHECKMATE. |
| Death | 1 HP means one hit kills — unless you bought **Hồi sinh** (auto-respawn at the start square once) or **Giáp** (+1 max HP). Otherwise the lose screen offers "Thử lại wave này". |

### Queen HP — why 20, not 900

The video number is **900 HP**, but at the original **1 damage per hit**
that would be 900 attacks — unplayable. The demo scales her to **20 HP**
(20 clean hits). The boss bar shows both numbers ("20/20 (demo; video:
900)"). The plan doc says the real number must be set from target fight
length and measured player DPS, not copied from the video — Codex should
re-balance this, not just restore 900.

### Balance question, stated honestly

With 1 damage vs 5-HP enemies, Wave 1 (2 pawns + 1 knight) needs **15
successful attacks** to clear. That is the original design, kept
faithfully — but it is slow, and the demo's answer is only "cards help
you reach enemies, waves are small". If playtesting shows it drags, the
right fix is a *design* decision by the owner (e.g. enemy HP 3, or a
damage upgrade path), not a silent code change. Do not change
`playerDamage` or enemy HP without saying so in the plan doc first.

## What is in the demo

- **Wave 1** — 2 pawns + 1 Knight. **Wave 2** — Knight + Bishop + 2 pawns.
  **Wave 3** — Rook + Bishop + Assassin-Knight. **Final** — **THE QUEEN**
  (20 HP demo-scaled, AoE + line attacks).
- Shop between waves, cards in hand, turn queue, warnings, promotion
  square, Queen capture choice, win/lose screens, timer replaced by a
  turn counter (turn-based games count turns, not seconds).

## What is NOT in the demo yet

- **King final-boss fight** (chapter 4) — the demo ends at the Queen choice.
- Chapters 1–4 full structure (20 levels / 5 chapters is an *estimate*,
  not a commitment — see the plan doc).
- Terrain: teleport gates, castle gates, river.
- Multiple-endings persistence beyond the Queen choice text.
- The old real-time systems are **deliberately removed**: stamina,
  dodge-roll i-frames, parry, Soul-dash, attack-token cap, telegraphs —
  they belonged to the real-time direction and have no meaning here.
  (Souls are also gone; gold is the only currency now.)
- **Known limitation, stated honestly:** the graphics are procedural
  LatheGeometry/box chess pieces with a stylised box-and-cone Knight —
  handsome at game distance, but not sculpted models. If the owner wants
  that look, the pieces in `makePieceMesh()` / `PIECE_BUILDERS` are the
  single place to swap in real GLTF models later.

## Code map (for Codex — keep it to these files)

```
the-tot-war/
  index.html      — page shell, HUD (turn queue, actions, cards, shop), all screens, import map
  src/main.js     — the whole game (one module): CONFIG, scene/board/pieces,
                    grid helpers, turn engine, enemy AI, shop, Queen boss
  README.md       — this file
  .gitignore
  .nojekyll       — keep Pages from running Jekyll (it broke a build once)
```

`src/main.js` structure, top to bottom:

1. **`CONFIG`** — every tunable number (player/enemy HP+damage, gold,
   shop prices, warnings, promo hits, intent delays, Queen numbers).
   Change balance here, never in logic.
2. DOM helpers + screens, **WebAudio beeps** (`sfx`).
3. Three.js scene: fixed angled top-down camera, lights, fog, **8×8 board**,
   square-highlight overlays (green move / red attack / orange danger / gold promo).
4. **Procedural pieces** (`makePawnMesh` … `makeKnightMesh`,
   `PIECE_BUILDERS`) — swap here for real models.
5. Grid helpers (`sqPos`, `inBoard`, `moveSquares`, `attackSquares`,
   `dangerSquares`) — the chess rules live here.
6. Input: click-to-move/attack (raycast to the board plane), WASD/arrows
   step, Space ends the turn, H heals, Esc pauses. **No pointer lock.**
7. Player actions: move (with warnings), attack (diagonal + push-back),
   cards, promotion, heal, damage/death/revive.
8. Enemy AI: `planEnemyMove` / `planQueenMove` (intent → 0.9s red
   highlight → execute), Queen AoE telegraphed one turn ahead.
9. **Turn engine** (`buildTurnQueue` / `advanceTurn` / `beginPlayerSegment`):
   interleaved enemy → player → enemy → player. This is the heart of the
   game — read it before touching anything else.
10. Waves, shop, Queen defeat + choice, HUD, screens, `animate()` loop
    (only animates floaters/fragments/timers — the game is turn-based).

Rules Codex must not silently change (they are the game's identity):
1 HP / 1 damage pawn, diagonal-only attack, 2 actions per turn,
interleaved turns, 3 warnings per wave, cards consumed immediately and
not carried over, promotion = 3 attacks + step in, Queen captured
(not killed). If a rule needs to change, say so in the plan doc first —
do not just edit the code.

## QA — rebuild verification (2026-11-06)

- `node --check src/main.js` — syntax OK.
- Local server test: `python3 -m http.server` → `curl` returns
  **HTTP 200** for `/` and `/src/main.js`; Three.js CDN URL reachable (200).
- Logic re-read pass (no browser available in the build environment):
  turn queue is built interleaved (enemy, player, enemy, player) and
  rebuilt each round; dead enemies are skipped in `advanceTurn` so the
  queue can never stall on a corpse; `checkWaveClear` splices dead
  enemies only after confirming all are dead; the promotion square is
  picked on an unoccupied square and can only be attacked from a legal
  attack square; the Queen AoE is stored on `STATE.queenAoe`, marked on
  her turn and resolved at the start of her *next* turn, so the player
  always gets a full player segment to step out; `dangerSquares` uses
  the same chess rules as the enemy AI.
- **Still NOT verified in a real browser** (the build environment cannot
  open localhost in a browser, and GitHub Pages is pushed by the parent):
  click-to-move, a diagonal attack landing, the warning stopping a bad
  move, card use, promotion (3 attacks + step in + form choice), the
  shop (buy + next wave), and the Queen fight + capture choice all still
  need a real playthrough at
  https://laoban-makeyourich.github.io/the-tot-war/ after the push.
  First things to check: Wave 1 — click a green square to move, click a
  red diagonal enemy to attack, press Space to end the turn, watch the
  enemy act on its red-highlighted square.
