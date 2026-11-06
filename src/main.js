// ============================================================================
// THE TOT WAR — playable demo, TURN-BASED grid tactics (2026-11-06 rebuild)
// The original design was turn-based: every piece occupies exactly one
// square of an 8x8 board and moves square-to-square. The real-time build
// that lived here before was the WRONG direction (it was made from the
// TikTok video) and has been replaced by this file, per the owner's
// decision: "game ban đầu là theo lượt" + "di chuyển trên các ô bàn cờ".
// Keep: Three.js setup, dark-red 8x8 board, procedural chess pieces
// (LatheGeometry), Queen 900 HP capture-alive choice, dark tone.
// Change: gameplay is turn-based, camera is a fixed angled top-down view
// of the whole board (no third-person, no pointer lock, no WASD free roam).
// Single file on purpose: the owner will hand this to Codex next.
// ============================================================================
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// CONFIG — every tunable number lives here. Game logic below must read from
// CONFIG, never from hard-coded magic numbers, so balance can be tuned
// without touching the rules.
// ---------------------------------------------------------------------------
const CONFIG = {
  boardTiles: 8,
  tileSize: 2,              // world units per tile
  // --- player (ORIGINAL brief numbers, faithful) ---
  playerMaxHp: 1,           // 1 life — one hit kills (see shop: +HP / revive)
  playerDamage: 1,          // 1 damage per attack (original design)
  healsPerWave: 1,          // free heal charges refilled each wave
  healAmount: 1,            // a heal restores 1 HP
  // --- enemies: HP / damage (original brief: every piece 5 HP, 1 dmg) ---
  enemies: {
    pawn:     { hp: 5, dmg: 1 },
    knight:   { hp: 5, dmg: 1 },
    bishop:   { hp: 5, dmg: 1 },
    rook:     { hp: 5, dmg: 1 },
    assassin: { hp: 5, dmg: 1 },
    // Queen: the VIDEO number is 900 HP, but at 1 damage per hit that is
    // 900 attacks — unplayable in a turn-based demo. DEMO-SCALED to 20 HP
    // (20 clean hits); the plan doc says the real number must be set from
    // target fight length and measured player DPS, not copied from video.
    queen:    { hp: 20, dmg: 1, videoHp: 900 },
  },
  // --- gold / shop ---
  goldPerKill: { pawn: 10, knight: 15, bishop: 15, rook: 20, assassin: 20, queen: 0 },
  waveClearBonus: 30,
  shop: {
    armor:  { name: 'Giáp +1 HP',   desc: 'Máu tối đa +1 và hồi đầy máu', cost: 30 },
    revive: { name: 'Hồi sinh',     desc: 'Chết 1 lần trong wave sẽ tự hồi sinh tại ô xuất phát', cost: 50 },
    knife:  { name: 'Dao',          desc: 'Sát thương cận chiến +1 (vẫn chém chéo)', cost: 40, once: true },
    gun:    { name: 'Súng',         desc: 'Bắn thẳng tới 3 ô, tốn 1 hành động', cost: 60, once: true },
  },
  // --- turn rules ---
  actionsPerTurn: 2,        // each player segment = 2 actions, move+attack share them
  warningsPerWave: 3,       // warnings before walking into an attacked square
  promoHitsToUnlock: 3,     // attack the promotion square 3 times to unlock
  enemyIntentDelay: 0.9,    // seconds the enemy's intended square stays red before it acts
  enemyActDelay: 0.45,      // pause after an enemy acts, before the next turn
  queenAoeSize: 3,          // Queen AoE is a 3x3 area, telegraphed one turn ahead
  queenLineRange: 4,        // Queen line attack range (squares)
  pushbackBonus: 1,         // +damage when a pushed enemy hits edge/another enemy
  cameraHeight: 20,
  cameraBack: 13,
  pixelRatioCap: 1.5,
};

// ---------------------------------------------------------------------------
// Tiny DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = $('hud'), waveEl = $('wave-label'), queueEl = $('turn-queue');
const hpEl = $('hp'), actionsEl = $('actions'), goldEl = $('gold');
const warningsEl = $('warnings'), cardsEl = $('cards'), bossWrap = $('boss-wrap');
const bossFill = $('boss-fill'), bossLabel = $('boss-name');
const bannerEl = $('banner'), toastEl = $('toast'), vignette = $('damage-vignette');
const shopEl = $('screen-shop'), shopGoldEl = $('shop-gold'), shopItemsEl = $('shop-items');
const screens = {
  title: $('screen-title'), pause: $('screen-pause'), queen: $('screen-queen'),
  win: $('screen-win'), lose: $('screen-lose'), shop: shopEl,
  promote: $('screen-promote'),
};
function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  if (!name) for (const el of Object.values(screens)) el.classList.add('hidden');
}
function showToast(text, ms = 3000) {
  toastEl.textContent = text;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toastEl.textContent = ''; }, ms);
}
function showBanner(text, ms = 2200) {
  bannerEl.textContent = text;
  bannerEl.style.opacity = '1';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { bannerEl.style.opacity = '0'; }, ms);
}

// ---------------------------------------------------------------------------
// Audio — WebAudio beeps only, no audio files.
// ---------------------------------------------------------------------------
let audioCtx = null;
function beep(freq, dur = 0.12, type = 'sine', vol = 0.15, when = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime + when;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* audio is a nice-to-have; never crash the game for it */ }
}
const sfx = {
  move: () => beep(300, 0.07, 'triangle', 0.1),
  hit: () => beep(180, 0.1, 'square', 0.12),
  hurt: () => beep(110, 0.2, 'sawtooth', 0.15),
  warn: () => { beep(880, 0.12, 'sine', 0.14); beep(660, 0.16, 'sine', 0.12, 0.1); },
  die: () => beep(70, 0.4, 'sawtooth', 0.14),
  pickup: () => beep(660, 0.09, 'sine', 0.12),
  promotion: () => { beep(523, 0.12, 'sine', 0.14); beep(784, 0.2, 'sine', 0.14, 0.1); },
  wave: () => { beep(392, 0.14, 'triangle', 0.14); beep(523, 0.2, 'triangle', 0.14, 0.12); },
  gold: () => beep(990, 0.1, 'sine', 0.1),
};

// ---------------------------------------------------------------------------
// Three.js scene — fixed angled top-down camera: the whole board must be
// visible at once, because this is a tactics game, not a third-person one.
// ---------------------------------------------------------------------------
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120404);
scene.fog = new THREE.Fog(0x120404, 30, 70);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 150);
camera.position.set(0, CONFIG.cameraHeight, CONFIG.cameraBack);
camera.lookAt(0, 0, -0.5);
scene.add(camera);

const keyLight = new THREE.DirectionalLight(0xffe0b3, 2.2);
keyLight.position.set(8, 14, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -12; keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12; keyLight.shadow.camera.bottom = -12;
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0x604040, 0.7));
const rimLight = new THREE.DirectionalLight(0xff2a1a, 1.1);
rimLight.position.set(-6, 5, -10);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(0x8a5a4a, 0x1a0505, 0.5));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Board: 8x8 tiles, alternating dark red / near-black, plus edge glow.
// Grid: r = 0 (far rank, enemy side) .. 7 (near rank, player side),
// c = 0..7. Tile centres run from -7..+7 (tileSize 2).
// ---------------------------------------------------------------------------
const BOARD_HALF = (CONFIG.boardTiles * CONFIG.tileSize) / 2; // 8
const tileGeo = new THREE.BoxGeometry(CONFIG.tileSize, 0.3, CONFIG.tileSize);
const tileMatA = new THREE.MeshStandardMaterial({ color: 0x5a1210, roughness: 0.85 });
const tileMatB = new THREE.MeshStandardMaterial({ color: 0x1c0a0a, roughness: 0.85 });
const tiles = [];
for (let r = 0; r < CONFIG.boardTiles; r++) {
  for (let c = 0; c < CONFIG.boardTiles; c++) {
    const t = new THREE.Mesh(tileGeo, (r + c) % 2 === 0 ? tileMatA : tileMatB);
    t.position.set((c - 3.5) * CONFIG.tileSize, -0.15, (r - 3.5) * CONFIG.tileSize);
    t.receiveShadow = true;
    scene.add(t);
    tiles.push(t);
  }
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshStandardMaterial({ color: 0x0a0202, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.32; ground.receiveShadow = true;
scene.add(ground);
const edgeGlow = new THREE.Mesh(
  new THREE.BoxGeometry(BOARD_HALF * 2 + 0.4, 0.12, BOARD_HALF * 2 + 0.4),
  new THREE.MeshBasicMaterial({ color: 0xaa2211 }));
edgeGlow.position.y = -0.28;
scene.add(edgeGlow);

// Square-highlight overlays (one reusable mesh per kind, repositioned).
function makeHighlight(color, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.tileSize * 0.94, CONFIG.tileSize * 0.94),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  m.visible = false;
  scene.add(m);
  return m;
}
const hlMove = [], hlAttack = [], hlDanger = [];
for (let i = 0; i < 64; i++) {
  hlMove.push(makeHighlight(0x27ae60, 0.55));   // green = legal move
  hlAttack.push(makeHighlight(0xe74c3c, 0.65)); // red = attackable enemy
  hlDanger.push(makeHighlight(0xff8800, 0.5));  // orange = enemy intent / danger
}
const hlHover = makeHighlight(0xffffff, 0.25);
const hlPromo = makeHighlight(0xffd34d, 0.7);   // gold = promotion square
const hlPromoUnlocked = makeHighlight(0x2ecc71, 0.85);
function placeHl(mesh, r, c) { mesh.position.x = (c - 3.5) * 2; mesh.position.z = (r - 3.5) * 2; mesh.visible = true; }
function hideAllHl() {
  for (const arr of [hlMove, hlAttack, hlDanger]) for (const m of arr) m.visible = false;
  hlHover.visible = false;
}

// ---------------------------------------------------------------------------
// Procedural chess pieces (LatheGeometry profiles). White = hero, black =
// enemies. Knight gets a stylised horse head from boxes/cones.
// ---------------------------------------------------------------------------
function latheFromProfile(points, material) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), material);
  m.castShadow = true;
  return m;
}
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.35, metalness: 0.05 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x16121a, roughness: 0.4, metalness: 0.35 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8a83c, roughness: 0.3, metalness: 0.8 });
const redEyeMat = new THREE.MeshBasicMaterial({ color: 0xff2211 });

function makePawnMesh(mat) {
  const g = new THREE.Group();
  g.add(latheFromProfile(
    [[0, 0], [0.42, 0], [0.42, 0.06], [0.30, 0.12], [0.22, 0.35], [0.16, 0.62],
     [0.24, 0.72], [0.28, 0.82], [0.20, 0.95], [0, 1.02]], mat));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), mat);
  head.position.y = 1.18; head.castShadow = true; g.add(head);
  return g;
}
function makeRookMesh(mat) {
  const g = new THREE.Group();
  g.add(latheFromProfile(
    [[0, 0], [0.5, 0], [0.5, 0.08], [0.36, 0.16], [0.28, 0.5], [0.34, 0.9],
     [0.42, 1.0], [0.42, 1.25], [0, 1.25]], mat));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), mat);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.position.set(Math.cos(a) * 0.32, 1.36, Math.sin(a) * 0.32);
    b.castShadow = true; g.add(b);
  }
  return g;
}
function makeBishopMesh(mat) {
  const g = new THREE.Group();
  g.add(latheFromProfile(
    [[0, 0], [0.46, 0], [0.46, 0.07], [0.32, 0.14], [0.22, 0.45], [0.18, 0.8],
     [0.26, 0.95], [0.14, 1.05], [0, 1.1]], mat));
  const mitre = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.62, 20), mat);
  mitre.position.y = 1.38; mitre.castShadow = true; g.add(mitre);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x000000 }));
  slit.position.set(0, 1.38, 0.14); g.add(slit);
  return g;
}
function makeQueenMesh(mat) {
  const g = new THREE.Group();
  g.add(latheFromProfile(
    [[0, 0], [0.55, 0], [0.55, 0.08], [0.38, 0.16], [0.26, 0.55], [0.2, 1.0],
     [0.3, 1.2], [0.2, 1.45], [0.34, 1.6], [0.34, 1.7], [0, 1.7]], mat));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8), goldMat);
    spike.position.set(Math.cos(a) * 0.3, 1.88, Math.sin(a) * 0.3);
    spike.castShadow = true; g.add(spike);
  }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), goldMat);
  orb.position.y = 1.95; g.add(orb);
  return g;
}
function makeKingMesh(mat) {
  const g = new THREE.Group();
  g.add(latheFromProfile(
    [[0, 0], [0.58, 0], [0.58, 0.08], [0.4, 0.16], [0.28, 0.6], [0.22, 1.1],
     [0.32, 1.3], [0.22, 1.55], [0.36, 1.7], [0.36, 1.8], [0, 1.8]], mat));
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), goldMat);
  crossV.position.y = 2.05; g.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), goldMat);
  crossH.position.y = 2.08; g.add(crossH);
  return g;
}
function makeKnightMesh(mat) {
  const g = new THREE.Group();
  g.add(latheFromProfile(
    [[0, 0], [0.48, 0], [0.48, 0.07], [0.34, 0.15], [0.26, 0.5], [0.3, 0.7], [0, 0.7]], mat));
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.5), mat);
  neck.position.set(0, 1.05, -0.08); neck.rotation.x = -0.35; neck.castShadow = true; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.85), mat);
  head.position.set(0, 1.55, 0.28); head.rotation.x = 0.35; head.castShadow = true; g.add(head);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.4), mat);
  muzzle.position.set(0, 1.42, 0.72); muzzle.castShadow = true; g.add(muzzle);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 8), mat);
    ear.position.set(s * 0.16, 1.92, 0.05); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), redEyeMat);
    eye.position.set(s * 0.21, 1.62, 0.55); g.add(eye);
  }
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x000000 }));
  mane.position.set(0, 1.15, -0.36); mane.rotation.x = -0.35; g.add(mane);
  return g;
}
const PIECE_BUILDERS = {
  pawn: makePawnMesh, rook: makeRookMesh, bishop: makeBishopMesh,
  queen: makeQueenMesh, king: makeKingMesh, knight: makeKnightMesh,
  assassin: makeKnightMesh,
};
function makePieceMesh(type, isWhite) {
  const mesh = PIECE_BUILDERS[type](isWhite ? whiteMat : blackMat);
  const s = type === 'queen' ? 1.25 : type === 'king' ? 1.3 : type === 'knight' || type === 'assassin' ? 1.1 : 1;
  mesh.scale.setScalar(s);
  return mesh;
}
// Floating damage numbers (small sprites made from canvas text).
function makeFloatingText(text, color = '#ffd34d') {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = color; ctx.strokeStyle = '#000'; ctx.lineWidth = 6;
  ctx.strokeText(text, 64, 44); ctx.fillText(text, 64, 44);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.4, 1.2, 1);
  return sp;
}
const floaters = [];
function spawnFloater(text, pos, color) {
  const sp = makeFloatingText(text, color);
  sp.position.copy(pos).add(new THREE.Vector3(0, 1.6, 0));
  scene.add(sp);
  floaters.push({ sp, life: 1.6 });
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.sp.position.y += dt * 1.2;
    f.sp.material.opacity = Math.max(0, f.life / 1.6);
    if (f.life <= 0) { scene.remove(f.sp); floaters.splice(i, 1); }
  }
}
const fragments = [];
function shatter(pos, color = 0x222222) {
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    f.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
    scene.add(f);
    fragments.push({
      mesh: f, life: 0.9,
      vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 2, (Math.random() - 0.5) * 6),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
    });
  }
}
function updateFragments(dt) {
  for (let i = fragments.length - 1; i >= 0; i--) {
    const f = fragments[i];
    f.life -= dt;
    f.vel.y -= 14 * dt;
    f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt;
    if (f.mesh.position.y < 0.05) { f.mesh.position.y = 0.05; f.vel.y = 0; f.vel.x *= 0.8; f.vel.z *= 0.8; }
    if (f.life <= 0) { scene.remove(f.mesh); fragments.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------------
// Grid helpers. r = row 0..7 (0 = far rank, enemy side), c = col 0..7.
// World: x = (c-3.5)*2, z = (r-3.5)*2. Player starts near side, row 6.
// ---------------------------------------------------------------------------
const sqPos = (r, c) => new THREE.Vector3((c - 3.5) * 2, 0, (r - 3.5) * 2);
const inBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const key = (r, c) => r * 8 + c;
const DIRS_ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIRS_DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const DIRS_ALL = [...DIRS_ORTHO, ...DIRS_DIAG];
const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const STATE = {
  phase: 'title',        // title | playing | paused | shop | promoteChoice | queenChoice | win | lose
  waveIndex: 0,
  turnCount: 0,          // total player segments played (timer substitute)
  gold: 0,
  kills: 0,
  warningsLeft: CONFIG.warningsPerWave,
  warningsExhaustedShown: false,
  promo: null,           // {r, c, hits, unlocked}
  queenAoe: null,        // {squares: [{r,c}], } pending Queen AoE, resolves on her next turn
  turnQueue: [],         // [{kind:'player'|'enemy', enemy}] — interleaved order
  turnState: 'idle',     // player | enemyIntent | enemyAct | busy
  turnTimer: 0,
  pendingAdvance: false, // stepped onto the promo square on the last action:
                          // the turn advances only AFTER the form is chosen
  currentEnemy: null,
  currentIntent: null,
  queenDefeated: false,
};
const player = {
  group: new THREE.Group(),
  pieceMesh: null,
  r: 6, c: 3,            // start square, near side
  hp: CONFIG.playerMaxHp,
  maxHp: CONFIG.playerMaxHp,
  revives: 0,
  heals: CONFIG.healsPerWave,
  damageBonus: 0,        // +1 from the knife
  hasGun: false,
  form: null,            // null = pawn; 'knight'|'bishop'|'rook'|'queen' after promotion (wave only)
  cardForm: null,        // movement granted by a card, this player segment only
  cardUsedThisSegment: false,
  actions: 0,
  hand: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
  dead: false,
};
const enemies = [];      // {type, r, c, hp, maxHp, group, dead, flashT}
const START_SQ = { r: 6, c: 3 };

function setPlayerPiece(type) {
  if (player.pieceMesh) player.group.remove(player.pieceMesh);
  player.pieceMesh = makePieceMesh(type, true);
  player.group.add(player.pieceMesh);
}
// Hero pawn + sword + shield.
setPlayerPiece('pawn');
const sword = new THREE.Group();
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.15, 0.22),
  new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.2, metalness: 0.9 }));
blade.position.y = 0.75; blade.castShadow = true;
const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08),
  new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 }));
hilt.position.y = 0.12;
sword.add(blade, hilt);
sword.position.set(0.55, 0.9, 0.25);
sword.rotation.z = -0.5;
player.group.add(sword);
const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20),
  new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 0.6 }));
shield.rotation.x = Math.PI / 2; shield.rotation.z = 0.3;
shield.position.set(-0.55, 1.0, 0.15); shield.castShadow = true;
player.group.add(shield);
player.group.position.copy(sqPos(player.r, player.c));
scene.add(player.group);

function syncPiecePos(e) { e.group.position.copy(sqPos(e.r, e.c)); }
function enemyAt(r, c) { return enemies.find((e) => !e.dead && e.r === r && e.c === c) || null; }
function occupantAt(r, c) {
  if (!player.dead && player.r === r && player.c === c) return 'player';
  return enemyAt(r, c);
}
function isEmpty(r, c) { return inBoard(r, c) && !occupantAt(r, c); }

// ---------------------------------------------------------------------------
// Movement & attack sets — the chess rules, on squares.
// mode: 'pawn' (default), or a piece type from a promotion form / a card.
// ---------------------------------------------------------------------------
function moveSquares(mode, r, c) {
  const out = [];
  if (mode === 'knight') {
    for (const [dr, dc] of KNIGHT_JUMPS) {
      const nr = r + dr, nc = c + dc;
      if (isEmpty(nr, nc)) out.push({ r: nr, c: nc });
    }
    return out;
  }
  const dirs = mode === 'pawn' ? DIRS_ORTHO
    : mode === 'bishop' ? DIRS_DIAG
    : mode === 'rook' ? DIRS_ORTHO : DIRS_ALL;
  const sliding = mode !== 'pawn';
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc)) {
      if (occupantAt(nr, nc)) break; // blocked — cannot jump over pieces
      out.push({ r: nr, c: nc });
      if (!sliding) break;
      nr += dr; nc += dc;
    }
  }
  return out;
}
function attackSquares(mode, r, c) {
  // Squares the pawn (or its current form) can ATTACK from (r,c).
  // Pawn: the 4 diagonal neighbours only — never straight ahead.
  const out = [];
  if (mode === 'pawn') {
    for (const [dr, dc] of DIRS_DIAG) {
      const nr = r + dr, nc = c + dc;
      if (inBoard(nr, nc)) out.push({ r: nr, c: nc });
    }
    return out;
  }
  if (mode === 'knight') {
    for (const [dr, dc] of KNIGHT_JUMPS) {
      const nr = r + dr, nc = c + dc;
      if (inBoard(nr, nc)) out.push({ r: nr, c: nc });
    }
    return out;
  }
  const dirs = mode === 'bishop' ? DIRS_DIAG : mode === 'rook' ? DIRS_ORTHO : DIRS_ALL;
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBoard(nr, nc)) {
      out.push({ r: nr, c: nc });
      if (occupantAt(nr, nc)) break; // first piece in the line blocks the rest
      nr += dr; nc += dc;
    }
  }
  return out;
}
function playerMode() { return player.cardForm || player.form || 'pawn'; }
function legalMoves() { return moveSquares(playerMode(), player.r, player.c); }
function legalAttacks() {
  // Attackable squares: enemies on an attack square, plus the promotion
  // square when it is attackable (diagonal neighbour for a pawn).
  const atk = attackSquares(playerMode(), player.r, player.c);
  const out = [];
  for (const sq of atk) {
    const e = enemyAt(sq.r, sq.c);
    if (e) out.push({ r: sq.r, c: sq.c, enemy: e });
  }
  if (STATE.promo && !STATE.promo.unlocked) {
    const p = STATE.promo;
    if (atk.some((s) => s.r === p.r && s.c === p.c)) out.push({ r: p.r, c: p.c, promo: true });
  }
  // Gun: straight line, up to 3 squares, first enemy in the line.
  if (player.hasGun) {
    for (const [dr, dc] of DIRS_ORTHO) {
      for (let d = 1; d <= 3; d++) {
        const nr = player.r + dr * d, nc = player.c + dc * d;
        if (!inBoard(nr, nc)) break;
        const e = enemyAt(nr, nc);
        if (e) { out.push({ r: nr, c: nc, enemy: e, gun: true }); break; }
        if (occupantAt(nr, nc)) break;
      }
    }
  }
  return out;
}
// Squares every living enemy could attack on its next turn — used for the
// warning system. Enemy pawns attack diagonally TOWARD the player (+r).
function dangerSquares() {
  const set = new Set();
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.type === 'pawn') {
      for (const dc of [-1, 1]) {
        const nr = e.r + 1, nc = e.c + dc;
        if (inBoard(nr, nc)) set.add(key(nr, nc));
      }
    } else if (e.type === 'knight' || e.type === 'assassin') {
      for (const [dr, dc] of KNIGHT_JUMPS) {
        const nr = e.r + dr, nc = e.c + dc;
        if (inBoard(nr, nc)) set.add(key(nr, nc));
      }
    } else if (e.type === 'queen') {
      for (const [dr, dc] of DIRS_ALL) {
        let nr = e.r + dr, nc = e.c + dc;
        while (inBoard(nr, nc)) { set.add(key(nr, nc)); if (occupantAt(nr, nc)) break; nr += dr; nc += dc; }
      }
    } else {
      const dirs = e.type === 'bishop' ? DIRS_DIAG : DIRS_ORTHO;
      for (const [dr, dc] of dirs) {
        let nr = e.r + dr, nc = e.c + dc;
        while (inBoard(nr, nc)) { set.add(key(nr, nc)); if (occupantAt(nr, nc)) break; nr += dr; nc += dc; }
      }
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Highlights: show legal moves / attacks every player segment.
// ---------------------------------------------------------------------------
function refreshHighlights() {
  hideAllHl();
  if (STATE.phase !== 'playing' || STATE.turnState !== 'player') return;
  const moves = legalMoves();
  moves.forEach((sq, i) => { if (i < hlMove.length) placeHl(hlMove[i], sq.r, sq.c); });
  const atks = legalAttacks();
  atks.forEach((sq, i) => { if (i < hlAttack.length) placeHl(hlAttack[i], sq.r, sq.c); });
  if (STATE.promo) {
    const p = STATE.promo;
    placeHl(p.unlocked ? hlPromoUnlocked : hlPromo, p.r, p.c);
  }
  // Queen AoE telegraph must SURVIVE the player's segment: it is marked
  // on the Queen's turn and resolves on her NEXT turn, so the player needs
  // to see the red squares for a whole player segment to step out of them.
  // refreshHighlights() clears all highlights, so re-draw the AoE here.
  if (STATE.queenAoe) {
    STATE.queenAoe.squares.forEach((sq, i) => { if (i < hlDanger.length) placeHl(hlDanger[i], sq.r, sq.c); });
  }
}

// ---------------------------------------------------------------------------
// Input — mouse-first: click a highlighted square. WASD / arrows step one
// square orthogonally. Space ends the turn. H heals. Esc pauses.
// No pointer lock anywhere: the camera is fixed, the mouse is a cursor.
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pickSquare(ev) {
  const rect = canvas.getBoundingClientRect();
  const mx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: mx, y: my }, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(boardPlane, hit)) return null;
  const c = Math.round(hit.x / 2 + 3.5);
  const r = Math.round(hit.z / 2 + 3.5);
  return inBoard(r, c) ? { r, c } : null;
}
canvas.addEventListener('pointermove', (ev) => {
  if (STATE.phase !== 'playing' || STATE.turnState !== 'player') { hlHover.visible = false; return; }
  const sq = pickSquare(ev);
  if (sq) placeHl(hlHover, sq.r, sq.c); else hlHover.visible = false;
});
canvas.addEventListener('pointerdown', (ev) => {
  if (STATE.phase !== 'playing' || STATE.turnState !== 'player') return;
  if (ev.button !== 0) return;
  const sq = pickSquare(ev);
  if (!sq) return;
  handleSquareClick(sq.r, sq.c);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (STATE.phase === 'playing' && STATE.turnState === 'player') {
    const step = { KeyW: [-1, 0], ArrowUp: [-1, 0], KeyS: [1, 0], ArrowDown: [1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] }[e.code];
    if (step) { tryStep(step[0], step[1]); return; }
    if (e.code === 'Space' || e.code === 'Enter') { endPlayerSegment(); return; }
    if (e.code === 'KeyH') { tryHeal(); return; }
  } else if (STATE.phase === 'playing' && e.code === 'Space') {
    // Space during an enemy segment: skip the intent animation, act now.
    if (STATE.turnState === 'enemyIntent') STATE.turnTimer = 0;
    return;
  }
  if (e.code === 'Escape') {
    if (STATE.phase === 'playing') pauseGame();
    else if (STATE.phase === 'paused') resumeGame();
  }
});
$('btn-end-turn').addEventListener('click', () => {
  if (STATE.phase === 'playing' && STATE.turnState === 'player') endPlayerSegment();
});

// ---------------------------------------------------------------------------
// Player actions — each costs 1 of the 2 actions in a player segment.
// ---------------------------------------------------------------------------
function spendAction() {
  player.actions--;
  updateHUD();
  if (player.actions <= 0) {
    // Stepped onto the promotion square on the last action: the turn must
    // NOT advance until the player has chosen a form (choosePromotionForm
    // resumes the engine via pendingAdvance).
    if (STATE.phase === 'promoteChoice') { STATE.pendingAdvance = true; return; }
    endPlayerSegment();
  } else refreshHighlights();
}
function tryStep(dr, dc) {
  const nr = player.r + dr, nc = player.c + dc;
  if (!inBoard(nr, nc)) { showToast('Ngoài bàn cờ!'); return; }
  const e = enemyAt(nr, nc);
  if (e) { showToast('Ô đó có địch — chém chéo hoặc dùng súng để tấn công!'); return; }
  if (!legalMoves().some((s) => s.r === nr && s.c === nc)) {
    showToast('Quân tốt chỉ đi thẳng 1 ô (hoặc theo nước đi của thẻ / dạng đã hóa).');
    return;
  }
  tryMoveTo(nr, nc);
}
function tryMoveTo(r, c) {
  // WARNINGS (3 per wave): walking into a square an enemy can attack
  // stops the move with a notification — the pawn must not walk into
  // death silently. Once the 3 warnings are spent, no more are given.
  const danger = dangerSquares();
  if (danger.has(key(r, c))) {
    if (STATE.warningsLeft > 0) {
      STATE.warningsLeft--;
      sfx.warn();
      showToast(`⚠ CẢNH BÁO (${STATE.warningsLeft} còn lại): ô đó đang bị địch ngắm! Nước đi đã dừng.`, 3200);
      // Flash the dangerous square orange for a moment.
      const idx = [...danger].indexOf(key(r, c));
      updateHUD();
      return; // move blocked, action NOT spent
    }
    if (!STATE.warningsExhaustedShown) {
      STATE.warningsExhaustedShown = true;
      showToast('Hết cảnh báo! Từ giờ không còn ai nhắc nữa — tự cẩn thận.', 3200);
    }
  }
  movePlayerTo(r, c);
  sfx.move();
  checkPromotionStep(); // before spendAction: the form choice must come before the turn advances
  spendAction();
}
function movePlayerTo(r, c) {
  player.r = r; player.c = c;
  player.group.position.copy(sqPos(r, c));
}
function handleSquareClick(r, c) {
  // Clicking an attackable square attacks; clicking a legal move square
  // moves; anything else is explained, not silently ignored.
  const atk = legalAttacks().find((s) => s.r === r && s.c === c);
  if (atk) { doAttack(atk); return; }
  if (legalMoves().some((s) => s.r === r && s.c === c)) { tryMoveTo(r, c); return; }
  const e = enemyAt(r, c);
  if (e) {
    showToast('Không tấn công được đó — tốt chỉ chém CHÉO 1 ô (hoặc theo dạng/thẻ/súng).');
    return;
  }
  showToast('Ô đó không đi tới được trong lượt này.');
}
function playerDamage() { return CONFIG.playerDamage + player.damageBonus; }
function doAttack(atk) {
  if (atk.promo) {
    // Attacking the promotion square (counts as an action).
    STATE.promo.hits++;
    sfx.hit();
    spawnFloater(`${STATE.promo.hits}/${CONFIG.promoHitsToUnlock}`, sqPos(atk.r, atk.c), '#ffd34d');
    if (STATE.promo.hits >= CONFIG.promoHitsToUnlock) {
      STATE.promo.unlocked = true;
      sfx.promotion();
      showBanner('PHONG VƯƠNG ĐÃ MỞ — BƯỚC VÀO Ô VÀNG!');
      showToast('Ô phong vương đã mở khóa! Bước vào đúng ô đó để hóa thân (chỉ trong wave này).', 3500);
    } else {
      showToast(`Đã tấn công ô phong vương ${STATE.promo.hits}/${CONFIG.promoHitsToUnlock} lần.`);
    }
    spendAction();
    return;
  }
  const e = atk.enemy;
  if (!e || e.dead) return;
  const dmg = playerDamage();
  sfx.hit();
  damageEnemy(e, dmg, { gun: atk.gun });
  // Push-back: the enemy is shoved 1 square away from the player along
  // the attack direction. Edge or a blocking piece = +1 damage; pushed
  // into another enemy = BOTH take +1.
  const dr = Math.sign(e.r - player.r), dc = Math.sign(e.c - player.c);
  const nr = e.r + dr, nc = e.c + dc;
  if (!inBoard(nr, nc)) {
    damageEnemy(e, CONFIG.pushbackBonus, { color: '#ff8844' });
    spawnFloater(`+${CONFIG.pushbackBonus} đẩy vào biên`, sqPos(e.r, e.c), '#ff8844');
  } else {
    const other = enemyAt(nr, nc);
    if (other) {
      damageEnemy(e, CONFIG.pushbackBonus, { color: '#ff8844' });
      damageEnemy(other, CONFIG.pushbackBonus, { color: '#ff8844' });
      spawnFloater(`+${CONFIG.pushbackBonus} đẩy vào nhau`, sqPos(e.r, e.c), '#ff8844');
    } else if (nr === player.r && nc === player.c) {
      damageEnemy(e, CONFIG.pushbackBonus, { color: '#ff8844' });
    } else {
      e.r = nr; e.c = nc; syncPiecePos(e);
    }
  }
  spendAction();
}
function damageEnemy(e, dmg, opts = {}) {
  if (e.dead) return;
  e.hp -= dmg;
  spawnFloater(opts.gun ? `-${dmg} 🔫` : `-${dmg}`, sqPos(e.r, e.c), opts.color || '#ffd34d');
  if (e.hp <= 0) killEnemy(e);
  else updateHUD();
}
function killEnemy(e) {
  e.dead = true;
  shatter(sqPos(e.r, e.c), 0x1a1420);
  scene.remove(e.group);
  STATE.kills++;
  const g = CONFIG.goldPerKill[e.type] || 0;
  STATE.gold += g;
  sfx.gold();
  spawnFloater(`+${g} vàng`, sqPos(e.r, e.c), '#ffd34d');
  // CARDS: killing an enemy gives that piece's consumable card.
  player.hand[e.type] = (player.hand[e.type] || 0) + 1;
  showToast(`Đã giết ${PIECE_NAME[e.type]}! +${g} vàng, nhận thẻ ${PIECE_NAME[e.type]}.`, 2600);
  renderCards();
  updateHUD();
  if (e.type === 'queen') { onQueenDefeated(); return; }
  checkWaveClear();
}
function tryHeal() {
  if (player.heals <= 0) { showToast('Hết lượt hồi máu ở wave này! (Mua Giáp ở shop để tăng máu tối đa.)'); return; }
  if (player.hp >= player.maxHp) { showToast('Máu đã đầy!'); return; }
  player.heals--;
  player.hp = Math.min(player.maxHp, player.hp + CONFIG.healAmount);
  spawnFloater(`+${CONFIG.healAmount} HP`, sqPos(player.r, player.c), '#7dff9a');
  sfx.pickup();
  updateHUD();
}
function useCard(type) {
  if (STATE.phase !== 'playing' || STATE.turnState !== 'player') { showToast('Chỉ dùng thẻ trong lượt của mình.'); return; }
  if (!player.hand[type] || player.hand[type] <= 0) return;
  if (player.cardUsedThisSegment) { showToast('Lượt này đã dùng 1 thẻ rồi — thẻ chỉ dùng trong lượt hiện tại.'); return; }
  player.hand[type]--;
  player.cardUsedThisSegment = true;
  if (type === 'pawn') {
    // Pawn card: the pawn's own movement is no upgrade — grant +1 action.
    player.actions++;
    showToast('Dùng thẻ Tốt: +1 hành động trong lượt này!');
  } else {
    player.cardForm = type;
    showToast(`Dùng thẻ ${PIECE_NAME[type]}: lượt này di chuyển như ${PIECE_NAME[type]}!`);
  }
  sfx.pickup();
  renderCards();
  refreshHighlights();
  updateHUD();
}
const PIECE_NAME = { pawn: 'Tốt', knight: 'Mã', bishop: 'Tượng', rook: 'Xe', queen: 'Hậu', assassin: 'Sát thủ' };

// ---------------------------------------------------------------------------
// Promotion ("phong vương") — attack the square 3 times, then MOVE into it.
// ---------------------------------------------------------------------------
function checkPromotionStep() {
  const p = STATE.promo;
  if (!p || !p.unlocked) return;
  if (player.r === p.r && player.c === p.c) {
    // No auto-promotion: the player must CHOOSE a form.
    STATE.phase = 'promoteChoice';
    showScreen('promote');
    sfx.promotion();
  }
}
function choosePromotionForm(form) {
  player.form = form;
  setPlayerPiece(form);
  showScreen(null);
  STATE.phase = 'playing';
  showBanner(`PHONG VƯƠNG — HÓA THÀNH ${PIECE_NAME[form].toUpperCase()}!`);
  showToast(`Giờ bạn di chuyển và tấn công như ${PIECE_NAME[form]} — chỉ trong wave này.`);
  STATE.promo = null; // square consumed
  refreshHighlights();
  updateHUD();
  if (STATE.pendingAdvance) { STATE.pendingAdvance = false; endPlayerSegment(); }
}

// ---------------------------------------------------------------------------
// Damage to the player / death / revive
// ---------------------------------------------------------------------------
function damagePlayer(dmg, sourcePos) {
  if (player.dead || STATE.phase !== 'playing') return;
  player.hp -= dmg;
  spawnFloater(`-${dmg}`, sqPos(player.r, player.c), '#ff5544');
  vignette.style.boxShadow = 'inset 0 0 120px 40px rgba(192,57,43,.55)';
  setTimeout(() => { vignette.style.boxShadow = 'inset 0 0 120px 40px rgba(192,57,43,0)'; }, 250);
  sfx.hurt();
  updateHUD();
  if (player.hp <= 0) onPlayerDeath();
}
function onPlayerDeath() {
  if (player.revives > 0) {
    player.revives--;
    player.hp = player.maxHp;
    player.r = START_SQ.r; player.c = START_SQ.c;
    player.group.position.copy(sqPos(player.r, player.c));
    showBanner('HỒI SINH!');
    showToast('Hồi sinh đã cứu bạn một lần — quay lại ô xuất phát!');
    sfx.promotion();
    updateHUD();
    return;
  }
  player.dead = true;
  shatter(sqPos(player.r, player.c), 0xf2ead8);
  player.group.visible = false;
  sfx.die();
  STATE.phase = 'lose';
  STATE.turnState = 'idle';
  hideAllHl();
  showScreen('lose');
}
function retryWave() {
  player.dead = false;
  player.group.visible = true;
  player.hp = player.maxHp;
  player.r = START_SQ.r; player.c = START_SQ.c;
  player.group.position.copy(sqPos(player.r, player.c));
  showScreen(null);
  STATE.phase = 'playing';
  startWave(STATE.waveIndex);
}
function fullRestart() {
  STATE.gold = 0; STATE.kills = 0; STATE.warningsLeft = CONFIG.warningsPerWave;
  STATE.queenDefeated = false; STATE.queenAoe = null;
  player.maxHp = CONFIG.playerMaxHp; player.hp = CONFIG.playerMaxHp;
  player.revives = 0; player.damageBonus = 0; player.hasGun = false;
  player.form = null; player.cardForm = null;
  player.hand = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 };
  player.dead = false; player.group.visible = true;
  setPlayerPiece('pawn');
  showScreen(null);
  STATE.phase = 'playing';
  startWave(0);
}

// ---------------------------------------------------------------------------
// Enemy AI — one enemy acts at a time, on its own turn segment.
// Before it acts, its intended square stays red for enemyIntentDelay so
// the player can read the board (this replaces real-time telegraphs).
// ---------------------------------------------------------------------------
function enemyAttackSquares(e) {
  // Squares this enemy could capture onto from its square (chess rules).
  if (e.type === 'pawn') {
    return [{ r: e.r + 1, c: e.c - 1 }, { r: e.r + 1, c: e.c + 1 }].filter((s) => inBoard(s.r, s.c));
  }
  if (e.type === 'knight' || e.type === 'assassin') {
    return KNIGHT_JUMPS.map(([dr, dc]) => ({ r: e.r + dr, c: e.c + dc })).filter((s) => inBoard(s.r, s.c));
  }
  const dirs = e.type === 'bishop' ? DIRS_DIAG : e.type === 'rook' ? DIRS_ORTHO : DIRS_ALL;
  const out = [];
  for (const [dr, dc] of dirs) {
    let nr = e.r + dr, nc = e.c + dc;
    while (inBoard(nr, nc)) { out.push({ r: nr, c: nc }); if (occupantAt(nr, nc)) break; nr += dr; nc += dc; }
  }
  return out;
}
function distToPlayer(e) { return Math.abs(e.r - player.r) + Math.abs(e.c - player.c); }
function planEnemyMove(e) {
  // Returns {kind:'attack'|'move'|'wait', to:{r,c}}.
  // 1) If the player is on an attack square -> capture (move onto them).
  const atk = enemyAttackSquares(e);
  if (atk.some((s) => s.r === player.r && s.c === player.c)) {
    return { kind: 'attack', to: { r: player.r, c: player.c } };
  }
  // 2) Queen: AoE / line behaviour is handled in planQueenMove.
  // 3) Otherwise move toward the player along the piece's own rules.
  if (e.type === 'pawn') {
    const nr = e.r + 1, nc = e.c;
    if (inBoard(nr, nc) && isEmpty(nr, nc)) return { kind: 'move', to: { r: nr, c: nc } };
    return { kind: 'wait' };
  }
  if (e.type === 'knight' || e.type === 'assassin') {
    const steps = e.type === 'assassin' ? 2 : 1; // assassin dashes: 2 L-jumps per turn
    let r = e.r, c = e.c, moved = false;
    for (let i = 0; i < steps; i++) {
      let best = null, bestD = Math.abs(r - player.r) + Math.abs(c - player.c);
      for (const [dr, dc] of KNIGHT_JUMPS) {
        const nr = r + dr, nc = c + dc;
        if (!inBoard(nr, nc)) continue;
        if (nr === player.r && nc === player.c) { best = { r: nr, c: nc }; break; }
        if (occupantAt(nr, nc)) continue;
        const d = Math.abs(nr - player.r) + Math.abs(nc - player.c);
        if (d < bestD) { bestD = d; best = { r: nr, c: nc }; }
      }
      if (!best) break;
      r = best.r; c = best.c; moved = true;
      if (r === player.r && c === player.c) return { kind: 'attack', to: { r, c } };
    }
    return moved ? { kind: 'move', to: { r, c } } : { kind: 'wait' };
  }
  // Bishop / Rook / Queen (non-AoE part): slide toward the player.
  const dirs = e.type === 'bishop' ? DIRS_DIAG : e.type === 'rook' ? DIRS_ORTHO : DIRS_ALL;
  let best = null, bestD = distToPlayer(e);
  for (const [dr, dc] of dirs) {
    let nr = e.r + dr, nc = e.c + dc;
    while (inBoard(nr, nc)) {
      if (nr === player.r && nc === player.c) return { kind: 'attack', to: { r: nr, c: nc } };
      if (occupantAt(nr, nc)) break;
      const d = Math.abs(nr - player.r) + Math.abs(nc - player.c);
      if (d < bestD) { bestD = d; best = { r: nr, c: nc }; }
      nr += dr; nc += dc;
    }
  }
  return best ? { kind: 'move', to: best } : { kind: 'wait' };
}
function planQueenMove(e) {
  // The Queen's AoE (3x3 around the player) is telegraphed ONE TURN ahead:
  // she marks it on her turn, it resolves at the START of her next turn,
  // so the player gets a whole player segment to step out of the red.
  if (STATE.queenAoe) {
    return { kind: 'resolveAoe', to: null };
  }
  const cheb = Math.max(Math.abs(e.r - player.r), Math.abs(e.c - player.c));
  if (cheb <= 1) {
    return { kind: 'attack', to: { r: player.r, c: player.c } }; // adjacent melee
  }
  // Line attack: same row / column / diagonal, within range, path clear.
  const aligned = (e.r === player.r || e.c === player.c || Math.abs(e.r - player.r) === Math.abs(e.c - player.c))
    && distToPlayer(e) <= CONFIG.queenLineRange;
  if (aligned) {
    const dr = Math.sign(player.r - e.r), dc = Math.sign(player.c - e.c);
    let blocked = false, nr = e.r + dr, nc = e.c + dc;
    while (nr !== player.r || nc !== player.c) {
      if (occupantAt(nr, nc)) { blocked = true; break; }
      nr += dr; nc += dc;
    }
    if (!blocked) return { kind: 'lineAttack', to: { r: player.r, c: player.c } };
  }
  if (cheb <= 2) {
    // Close in: mark a 3x3 AoE around the player's current square.
    const squares = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = player.r + dr, nc = player.c + dc;
      if (inBoard(nr, nc)) squares.push({ r: nr, c: nc });
    }
    return { kind: 'markAoe', to: null, squares };
  }
  return planEnemyMove(e); // otherwise slide toward the player (queen lines)
}
function executeEnemyPlan(e, plan) {
  if (!plan || plan.kind === 'wait') return;
  if (plan.kind === 'markAoe') {
    STATE.queenAoe = { squares: plan.squares };
    plan.squares.forEach((sq, i) => { if (i < hlDanger.length) placeHl(hlDanger[i], sq.r, sq.c); });
    showToast('⚠ HẬU ĐANG TỤ LỰC — vùng đỏ 3x3 sẽ nổ ở lượt sau của Hậu! Hãy đi ra khỏi vùng đỏ!', 3400);
    sfx.warn();
    return;
  }
  if (plan.kind === 'resolveAoe') {
    const hit = STATE.queenAoe.squares.some((s) => s.r === player.r && s.c === player.c);
    for (const sq of STATE.queenAoe.squares) {
      shatter(sqPos(sq.r, sq.c), 0xcc2211);
    }
    STATE.queenAoe = null;
    hideAllHl();
    if (hit) { showToast('Hậu nổ AoE trúng bạn!'); damagePlayer(1, sqPos(e.r, e.c)); }
    else showToast('Bạn đã thoát khỏi vùng AoE của Hậu!');
    return;
  }
  if (plan.kind === 'lineAttack') {
    // The beam hits only the player's square, telegraphed by the red tile.
    showToast('Hậu bắn đòn theo hàng!');
    damagePlayer(1, sqPos(e.r, e.c));
    return;
  }
  if (plan.kind === 'attack') {
    // Capture: the enemy moves onto the player's square and deals 1 damage.
    e.r = plan.to.r; e.c = plan.to.c; syncPiecePos(e);
    damagePlayer(e.cfg.dmg, sqPos(e.r, e.c));
    return;
  }
  if (plan.kind === 'move') {
    e.r = plan.to.r; e.c = plan.to.c; syncPiecePos(e);
  }
}

// ---------------------------------------------------------------------------
// Turn engine — INTERLEAVED turns (the user's solution to 1-life vs 5-HP):
// enemy 1 acts, then the player acts, then enemy 2 acts, then the player
// acts... NOT all enemies before the player. The queue is rebuilt each
// round from the living enemies.
// ---------------------------------------------------------------------------
function buildTurnQueue() {
  const q = [];
  for (const e of enemies) {
    if (e.dead) continue;
    q.push({ kind: 'enemy', enemy: e });
    q.push({ kind: 'player' });
  }
  if (q.length === 0) q.push({ kind: 'player' });
  STATE.turnQueue = q;
}
function beginPlayerSegment() {
  STATE.turnState = 'player';
  STATE.turnCount++;
  player.actions = CONFIG.actionsPerTurn;
  player.cardForm = null;      // a card's movement lasts ONE player segment only
  player.cardUsedThisSegment = false;
  updateHUD();
  refreshHighlights();
}
function endPlayerSegment() {
  if (STATE.turnState !== 'player') return;
  hideAllHl();
  advanceTurn();
}
function advanceTurn() {
  if (STATE.phase !== 'playing') return;
  // Queen AoE pending? It stays marked across the player's segment and
  // resolves at the start of the Queen's next segment (see planQueenMove).
  const next = STATE.turnQueue.shift();
  if (!next) {
    // Round over: rebuild the interleaved queue for the next round.
    if (enemies.length === 0) { checkWaveClear(); return; }
    buildTurnQueue();
    advanceTurn();
    return;
  }
  if (next.kind === 'player') { beginPlayerSegment(); return; }
  const e = next.enemy;
  if (!e || e.dead) { advanceTurn(); return; } // skip the dead, don't stall
  // Enemy segment: show intent first, then act.
  const plan = e.type === 'queen' ? planQueenMove(e) : planEnemyMove(e);
  STATE.currentEnemy = e;
  STATE.currentIntent = plan;
  STATE.turnState = 'enemyIntent';
  STATE.turnTimer = CONFIG.enemyIntentDelay;
  // Highlight the intended square red so the player can read the board.
  hideAllHl();
  if (plan && plan.to) {
    placeHl(hlDanger[0], plan.to.r, plan.to.c);
    if (plan.kind === 'attack' || plan.kind === 'lineAttack') sfx.warn();
  }
  if (plan && plan.kind === 'markAoe') {
    plan.squares.forEach((sq, i) => { if (i < hlDanger.length) placeHl(hlDanger[i], sq.r, sq.c); });
  }
  updateHUD();
}
function updateTurnEngine(dt) {
  if (STATE.phase !== 'playing') return;
  if (STATE.turnState === 'enemyIntent') {
    STATE.turnTimer -= dt;
    if (STATE.turnTimer <= 0) {
      const e = STATE.currentEnemy, plan = STATE.currentIntent;
      STATE.turnState = 'enemyAct';
      STATE.turnTimer = CONFIG.enemyActDelay;
      hideAllHl();
      executeEnemyPlan(e, plan);
      STATE.currentEnemy = null; STATE.currentIntent = null;
      updateHUD();
      if (STATE.phase !== 'playing') return; // player may have died
    }
  } else if (STATE.turnState === 'enemyAct') {
    STATE.turnTimer -= dt;
    if (STATE.turnTimer <= 0) { STATE.turnState = 'busy'; advanceTurn(); }
  }
}

// ---------------------------------------------------------------------------
// Waves, shop, Queen defeat, win/lose
// ---------------------------------------------------------------------------
const WAVES = [
  { name: 'WAVE 1 — TỐT + MÃ', spawn: [['pawn', 1, 1], ['pawn', 1, 5], ['knight', 0, 3]] },
  { name: 'WAVE 2 — MÃ + TƯỢNG', spawn: [['knight', 0, 1], ['bishop', 0, 5], ['pawn', 1, 3], ['pawn', 1, 6]] },
  { name: 'WAVE 3 — XE + SÁT THỦ', spawn: [['rook', 0, 0], ['bishop', 0, 6], ['assassin', 1, 3]] },
  { name: 'BOSS — THE QUEEN', spawn: [['queen', 0, 3]] },
];
function clearEnemies() {
  for (const e of enemies) { scene.remove(e.group); }
  enemies.length = 0;
}
function createEnemy(type, r, c) {
  const cfg = CONFIG.enemies[type];
  const group = new THREE.Group();
  group.add(makePieceMesh(type, false));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), redEyeMat);
  eye.position.set(0, 1.25, 0.42); group.add(eye);
  group.position.copy(sqPos(r, c));
  scene.add(group);
  const e = { type, r, c, hp: cfg.hp, maxHp: cfg.hp, cfg, group, dead: false, flashT: 0 };
  enemies.push(e);
  return e;
}
function pickPromoSquare() {
  // A random square on the enemy side (rows 0-1), not occupied.
  for (let tries = 0; tries < 50; tries++) {
    const r = Math.floor(Math.random() * 2);
    const c = Math.floor(Math.random() * 8);
    if (!occupantAt(r, c)) return { r, c, hits: 0, unlocked: false };
  }
  return { r: 0, c: 0, hits: 0, unlocked: false };
}
function startWave(i) {
  STATE.waveIndex = i;
  const w = WAVES[i];
  clearEnemies();
  hideAllHl();
  STATE.promo = null;
  STATE.queenAoe = null;
  STATE.warningsLeft = CONFIG.warningsPerWave;
  STATE.warningsExhaustedShown = false;
  player.heals = CONFIG.healsPerWave;
  player.form = null; player.cardForm = null;
  setPlayerPiece('pawn');
  player.r = START_SQ.r; player.c = START_SQ.c;
  player.group.position.copy(sqPos(player.r, player.c));
  player.group.visible = true;
  player.dead = false;
  player.hp = player.maxHp;
  for (const [type, r, c] of w.spawn) createEnemy(type, r, c);
  if (i < WAVES.length - 1) STATE.promo = pickPromoSquare();
  waveEl.textContent = w.name;
  bossWrap.classList.toggle('hidden', i !== WAVES.length - 1);
  showBanner(w.name);
  sfx.wave();
  buildTurnQueue();
  STATE.phase = 'playing';
  advanceTurn();
  updateHUD();
  refreshHighlights();
}
function checkWaveClear() {
  if (STATE.phase !== 'playing' || STATE.queenDefeated) return;
  if (enemies.some((e) => !e.dead)) return;
  // All enemies dead. Remove the corpses from the list (they were already
  // removed from the scene in killEnemy; splice them out here).
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
  STATE.gold += CONFIG.waveClearBonus;
  sfx.wave();
  if (STATE.waveIndex >= WAVES.length - 1) return; // Queen handled by choice
  showBanner(`DỌN SẠCH WAVE ${STATE.waveIndex + 1} — +${CONFIG.waveClearBonus} VÀNG!`);
  openShop();
}
function onQueenDefeated() {
  STATE.queenDefeated = true;
  STATE.turnState = 'idle';
  hideAllHl();
  setTimeout(() => {
    if (STATE.phase !== 'playing') return;
    STATE.phase = 'queenChoice';
    showScreen('queen');
  }, 900);
}
function chooseQueen(capture) {
  showScreen(null);
  STATE.phase = 'win';
  const t = $('win-title'), x = $('win-text');
  if (capture) {
    t.textContent = 'CHECKMATE — KẾT THẬT';
    x.textContent = 'Bạn bắt sống Hậu. Vua đã mất Hậu, vương quốc mới của bạn có cả vua lẫn hậu — cuộc phản loạn thành công trọn vẹn.';
  } else {
    t.textContent = 'CHECKMATE — KẾT BÁO THÙ';
    x.textContent = 'Bạn kết liễu Hậu. Vua đã ngã, nhưng ngai vàng trống vắng — bạn thắng trận, nhưng mất đi người lẽ ra sẽ cùng bạn trị vì.';
  }
  showScreen('win');
}

// ---------------------------------------------------------------------------
// Shop — opens between waves. Gold from kills + wave-clear bonus.
// ---------------------------------------------------------------------------
function openShop() {
  STATE.phase = 'shop';
  STATE.turnState = 'idle';
  hideAllHl();
  shopGoldEl.textContent = STATE.gold;
  renderShopItems();
  showScreen('shop');
  updateHUD();
}
function renderShopItems() {
  shopItemsEl.innerHTML = '';
  const owned = { knife: player.damageBonus > 0, gun: player.hasGun };
  for (const [id, item] of Object.entries(CONFIG.shop)) {
    const div = document.createElement('div');
    div.className = 'shop-item';
    const isOwned = item.once && owned[id];
    const afford = STATE.gold >= item.cost;
    div.innerHTML = `<b>${item.name}</b> — ${item.cost} vàng<br><span>${item.desc}</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = isOwned ? 'ĐÃ MUA' : afford ? 'MUA' : 'KHÔNG ĐỦ VÀNG';
    btn.disabled = isOwned || !afford;
    btn.addEventListener('click', () => buyShopItem(id));
    div.appendChild(btn);
    shopItemsEl.appendChild(div);
  }
}
function buyShopItem(id) {
  const item = CONFIG.shop[id];
  if (!item || STATE.gold < item.cost) return;
  if (item.once && ((id === 'knife' && player.damageBonus > 0) || (id === 'gun' && player.hasGun))) return;
  STATE.gold -= item.cost;
  if (id === 'armor') { player.maxHp += 1; player.hp = player.maxHp; }
  else if (id === 'revive') { player.revives += 1; }
  else if (id === 'knife') { player.damageBonus += 1; }
  else if (id === 'gun') { player.hasGun = true; }
  sfx.gold();
  showToast(`Đã mua ${item.name}!`);
  shopGoldEl.textContent = STATE.gold;
  renderShopItems();
  updateHUD();
}
$('btn-next-wave').addEventListener('click', () => {
  showScreen(null);
  STATE.phase = 'playing';
  startWave(STATE.waveIndex + 1);
});

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function renderCards() {
  cardsEl.innerHTML = '';
  const names = { pawn: 'Tốt', knight: 'Mã', bishop: 'Tượng', rook: 'Xe', queen: 'Hậu' };
  for (const [type, n] of Object.entries(player.hand)) {
    if (n <= 0) continue;
    const b = document.createElement('button');
    b.className = 'card-btn';
    b.textContent = `🃏 ${names[type]} ×${n}`;
    b.title = type === 'pawn' ? 'Dùng: +1 hành động trong lượt này'
      : `Dùng: lượt này di chuyển như ${names[type]} (dùng xong thẻ biến mất)`;
    b.addEventListener('click', () => useCard(type));
    cardsEl.appendChild(b);
  }
  if (cardsEl.innerHTML === '') cardsEl.innerHTML = '<span class="note">Chưa có thẻ — giết địch để nhận thẻ bài của chúng.</span>';
}
function updateHUD() {
  hpEl.textContent = `Máu: ${Math.max(0, player.hp)}/${player.maxHp}` +
    (player.revives > 0 ? `  •  Hồi sinh: ${player.revives}` : '') +
    (player.heals > 0 ? `  •  Hồi máu (H): ${player.heals}` : '');
  actionsEl.textContent = `Hành động còn lại: ${'●'.repeat(Math.max(0, player.actions))}${'○'.repeat(Math.max(0, CONFIG.actionsPerTurn - player.actions))} (${player.actions}/${CONFIG.actionsPerTurn})`;
  goldEl.textContent = `Vàng: ${STATE.gold}`;
  warningsEl.textContent = STATE.warningsLeft > 0
    ? `Cảnh báo còn lại: ${STATE.warningsLeft}/${CONFIG.warningsPerWave}`
    : 'Hết cảnh báo!';
  const q = STATE.turnQueue.slice(0, 6).map((t) =>
    t.kind === 'player' ? 'Tốt' : PIECE_NAME[t.enemy.type]).join(' → ');
  queueEl.textContent = STATE.turnState === 'player'
    ? `Lượt của BẠN  •  Tiếp theo: ${q || '—'}`
    : (STATE.currentEnemy ? `Lượt: ${PIECE_NAME[STATE.currentEnemy.type]} đang hành động…  •  Tiếp theo: ${q || '—'}` : `Lượt: ${q || '—'}`);
  const qn = enemies.find((e) => e.type === 'queen' && !e.dead);
  if (qn) {
    bossLabel.textContent = `THE QUEEN — ${qn.hp}/20 (demo; video: 900)`;
    bossFill.style.width = `${(qn.hp / qn.maxHp) * 100}%`;
  }
  renderCards();
}

// ---------------------------------------------------------------------------
// Screens wiring + pause
// ---------------------------------------------------------------------------
function pauseGame() {
  if (STATE.phase !== 'playing') return;
  STATE.phase = 'paused';
  showScreen('pause');
}
function resumeGame() {
  if (STATE.phase !== 'paused') return;
  STATE.phase = 'playing';
  showScreen(null);
  refreshHighlights();
}
$('btn-start').addEventListener('click', () => {
  showScreen(null);
  hud.classList.remove('hidden');
  fullRestart();
});
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart-pause').addEventListener('click', () => { fullRestart(); });
$('btn-capture').addEventListener('click', () => chooseQueen(true));
$('btn-execute').addEventListener('click', () => chooseQueen(false));
$('btn-again-win').addEventListener('click', () => { fullRestart(); });
$('btn-again-lose').addEventListener('click', () => { fullRestart(); });
$('btn-retry').addEventListener('click', () => { retryWave(); });
for (const form of ['knight', 'bishop', 'rook', 'queen']) {
  $(`btn-promote-${form}`).addEventListener('click', () => choosePromotionForm(form));
}

// ---------------------------------------------------------------------------
// Main loop — the board is turn-based, so the loop only animates: floats,
// fragments, the promotion tile pulse, and the enemy-intent timers.
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateTurnEngine(dt);
  updateFloaters(dt);
  updateFragments(dt);
  if (STATE.promo) {
    const p = STATE.promo;
    const tile = p.unlocked ? hlPromoUnlocked : hlPromo;
    tile.material.opacity = (p.unlocked ? 0.7 : 0.5) + 0.25 * Math.sin(performance.now() / 250);
    if (!tile.visible) placeHl(tile, p.r, p.c);
  }
  renderer.render(scene, camera);
}
animate();
