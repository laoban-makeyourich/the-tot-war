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
  50°-wide cones centred on the forward diagonals, **plus a ±15° aim
  assist** around each cone edge (added 2026-11-06, see QA below).
  Enemies straight ahead take **no damage** — a faint gold cone flashes
  on every slash so the rule can be learned, and the tutorial says it
  outright. Tip the game itself teaches: rotate the camera so the
  enemy sits on a diagonal — the slash follows where the camera looks.
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

## QA 2026-11-06 — đợt sửa sau playtest thật trên trình duyệt

Playtest đầu tiên (GitHub Pages build, browser test) thấy: game tải
được, Wave 1 có 3 tốt đen, W di chuyển được — nhưng tốt trắng **chết
ở 00:16**, một cú click chuột trái **mở màn hình TẠM DỪNG thay vì
chém**, và không quan sát được cú chém nào trúng địch. Audit lại toàn
bộ `src/main.js` (1304 dòng) sau đó, và sửa như sau:

| # | Vấn đề tìm thấy | Nguyên nhân | Đã sửa |
|---|---|---|---|
| 1 | **Click chuột trái không bao giờ chém được nếu trình duyệt từ chối pointer lock** — mọi click đều rơi vào nhánh "thử lock lại rồi return". Đây là lỗi nghiêm trọng nhất, giải thích vì sao playtest không chém trúng ai. | `mousedown` khi chưa lock thì chỉ gọi `lockPointer()` và return, không có đường fallback. | Viết lại vòng đời pointer lock (`src/main.js`, section Input): click đầu tiên lock chuột (không chém); các click sau chém khi đã lock **hoặc khi lock không dùng được**; khi lock bị từ chối (`pointerlockerror` / promise reject không phải do Esc-cooldown) thì bật chế độ **drag-to-look** — di chuột thường cũng xoay camera, chuột trái chém thẳng. Game không còn trạng thái chết. |
| 2 | **Click chém có thể mở màn hình TẠM DỪNG.** | `pointerlockchange` pause game với *bất kỳ* lần mất lock nào khi đang chơi, kể cả lock chưa từng giữ được / mất ngay sau khi lấy. | Chỉ pause khi lock đã giữ thật > 600 ms (`POINTER_LOCK_GRACE_MS`) rồi mới mất (Esc / chuyển cửa sổ). Mất lock thoáng qua thì ở lại trong game. Esc cũng được xử lý rõ: khi không lock thì Esc = pause, khi pause thì Esc = resume (gộp vào 1 listener duy nhất — trước đây có 2 listener Esc, có thể pause rồi resume ngay trong cùng một phím). |
| 3 | **Chém chéo đúng toán học nhưng quá khó với người mới.** | `isInDiagonalCone` đã đúng (cone 20°–70° mỗi bên, dead zone 40°, range 2.6 — đã kiểm chứng bằng script Node với 13 góc mẫu, đều đúng). Nhưng địch tiếp cận **thẳng đầu** (góc ≈0°, đúng giữa dead zone) nên người đứng yên chém thì 100% hụt; các cú hụt trong playtest còn do địch ở xa >2.6 và do lỗi #1. | **Không** nới cone (luật đã chốt). Thêm **aim assist** theo đúng task: `CONFIG.aimAssistDeg = 15`, `CONFIG.deadZoneMinDeg = 5` — địch trong 15° quanh mép cone vẫn trúng (như chém "snap" về đường chéo gần nhất); thẳng trước mặt <5° vẫn **0 damage**. Vùng trúng hiệu dụng thành [5°, 85°], dead zone còn 10°. Wedge vàng hiển thị cũng vẽ theo vùng hiệu dụng này. Tutorial sửa thành "xoay camera để địch nằm trên ĐƯỜNG CHÉO". |
| 4 | **Wave 1 quá khó: chết ở ~16 giây.** | Tính lại: 2 token × chu kỳ ~3.65s × 10 dmg ≈ 20 dmg/3.6s → 100 HP hết trong ~18s nếu đứng yên (đúng như playtest 00:16), cộng với việc không chém được (lỗi #1, #3). | Chỉ đổi số trong CONFIG: tốt đen windup 0.6→**0.9s**, dmg 10→**8**, tốc độ 2.4→**2.0**; `enemyAttackCooldown` toàn cục 2.2→**2.8s**. Người chơi thụ động giờ sống ~28s; người biết di chuyển/né/hồi máu (và chém được, 1 hit giết 1 tốt vì 30 dmg = 30 HP) qua Wave 1 dễ hơn hẳn. Wave 2–3 giữ nguyên số cũ. |
| 5 | **Đạn của Tượng không bao giờ trúng** (lỗi mới, audit tìm ra). | Đạn bay ở y≈1.1, check trúng dùng khoảng cách 3D `distanceTo(player.pos)` ngưỡng 0.9 — khoảng cách tối thiểu luôn ≥1.1. | Check trúng dùng khoảng cách ngang XZ (`Math.hypot(dx, dz) < 0.9`). |
| 6 | **Xe charge xuyên qua người không gây sát thương** (lỗi mới). | `executeAttack` của Xe chỉ check trúng tại điểm cuối sau khi lao 5 đơn vị. | Check cả đoạn đường charge (point-to-segment, cùng cách tính như Soul-dash). |
| 7 | Rò rỉ material nhỏ: `updateEnemy` tạo `new MeshStandardMaterial` **mỗi frame** khi địch nhấp nháy trúng đòn. | — | Dùng 1 `flashMat` dùng chung. |
| 8 | Tutorial checklist luôn hiện ☐ kể cả khi đã xong. | `renderTutorial` hard-code ☐. | Hiện ☑ khi đã hoàn thành. |

Đã kiểm chứng lại sau khi sửa:

- `node --check src/main.js` — OK.
- Server local: `curl` trả **200** cho `/` và `/src/main.js` (66.008 byte); Three.js CDN trả 200.
- Script Node mô phỏng `isInDiagonalCone`: 13/13 góc mẫu đúng (0° hụt, 3° hụt, 5° trúng nhờ assist, 45° trúng, 85° trúng nhờ assist, 90° hụt, 180° hụt; có sửa 1 lỗi làm tròn float ở đúng biên 85° bằng epsilon 1e-9).
- 5 fix của bản build trước đã kiểm tra lại và **còn nguyên**: cờ `waveCleared`, melee của Hậu, hướng xoay cone-hint, point-to-segment của Soul-dash, không còn hàm pointer-lock tự gọi chính nó.
- Tất cả id DOM mà JS dùng đều có trong `index.html`; chỉ còn đúng 1 listener `keydown`.

**Vẫn CHƯA kiểm chứng được trong trình duyệt thật** (môi trường này
không mở được localhost trong trình duyệt, và GitHub Pages thì do
parent push sau): chưa có lần chơi end-to-end nào *sau* đợt sửa này
xác nhận click chuột trái chém trúng địch, parry, Soul-dash, ô phong
vương, trận Hậu và màn hình chọn bắt sống. Những điểm đó vẫn cần
người chơi thật (hoặc Codex) mở
https://laoban-makeyourich.github.io/the-tot-war/ sau khi push và
chơi thử Wave 1: chém chéo trúng, chém thẳng hụt, né lăn, và xem có
còn bị văng ra màn hình TẠM DỪNG khi click chuột nữa không.
