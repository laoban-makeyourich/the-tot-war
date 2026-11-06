// ============================================================================
// THE TOT WAR — playable 3D web demo (vertical slice)
// Real-time third-person Dark Souls-like on an 8x8 chessboard.
// Reference: Pawned Souls. All graphics are procedural (Three.js lathe/box
// geometry) — no external models or images, so the demo runs from any static
// server. Single file on purpose: the user will hand this to Codex next.
// ============================================================================
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// CONFIG — every tunable number lives here. Game logic below must read from
// CONFIG, never from hard-coded magic numbers, so balance can be tuned
// without touching the rules.
// ---------------------------------------------------------------------------
const CONFIG = {
  // --- board ---
  boardTiles: 8,            // 8x8
  tileSize: 2,              // world units per tile
  // --- player ---
  playerMaxHp: 100,
  playerDamage: 30,         // ~30 clean hits to kill the 900-HP Queen
  playerDamageBuff: 1.5,    // promotion ("phong vương") multiplies damage
  playerSpeed: 6,
  playerSprintSpeed: 9,
  playerRadius: 0.55,
  // stamina (max 100)
  staminaMax: 100,
  staminaRegen: 22,         // per second
  staminaAttack: 15,
  staminaRoll: 20,
  staminaBlockDrain: 10,    // per second while holding shield
  staminaSprintDrain: 12,   // per second
  staminaEmptyPenalty: 1.2, // seconds of "vulnerable" (no actions) at 0 stamina
  // combat timing
  attackCooldown: 0.45,     // seconds between slashes
  attackRange: 2.6,
  // DIAGONAL-ONLY: the sword hits inside two cones centred on the two
  // forward diagonals (±45° from facing). Each cone is DIAGONAL_CONE_WIDTH
  // wide, so the straight-ahead dead zone is 90° - cone width = 40°.
  // NOTE on the brief: the brief says "±50° around each diagonal", taken
  // literally that would cover straight ahead (45° away from a diagonal),
  // which would delete the rule entirely. We read it as a 50°-wide cone
  // (±25° around each diagonal) — generous, but straight-ahead enemies
  // still take no damage, which IS the rule.
  diagonalConeWidthDeg: 50,
  parryWindow: 0.35,        // seconds after RMB press that a parry counts
  parryStun: 1.6,            // seconds the parried enemy is stunned
  parrySouls: 2,            // souls granted by a successful parry
  dodgeDuration: 0.38,
  dodgeSpeed: 13,
  dodgeIFrames: 0.45,        // invulnerable seconds during a roll
  healAmount: 50,
  healsPerWave: 2,
  // --- enemies: HP / damage / speed / attack range ---
  enemies: {
    pawn:     { hp: 30,  dmg: 10, speed: 2.4, range: 1.9, windup: 0.6 },
    knight:   { hp: 60,  dmg: 15, speed: 3.0, range: 6.0, windup: 0.8 },
    bishop:   { hp: 50,  dmg: 12, speed: 2.2, range: 9.0, windup: 0.9 },
    rook:     { hp: 80,  dmg: 18, speed: 2.6, range: 9.0, windup: 1.0 },
    assassin: { hp: 50,  dmg: 20, speed: 3.6, range: 5.0, windup: 0.5 },
    queen:    { hp: 900, dmg: 25, speed: 3.4, range: 2.4, windup: 0.7 },
  },
  // ATTACK TOKEN RULE (mandatory, from the plan): at most this many enemies
  // may be in an attacking state at the same time. The rest must circle or
  // wait on cooldown — this is what makes 1-vs-many fair in real time.
  tokenCap: 2,
  enemyAttackCooldown: 2.2, // seconds between an enemy's attack attempts
  // --- Soul-dash (replaces the old turn-based 1-use card) ---
  soulDashDistance: 5,
  soulDashDamage: 20,
  // --- Queen boss ---
  queenAoeDelay: 1.5,       // red circle fills, then explodes
  queenAoeRadius: 2.6,
  queenAoeDamage: 30,
  queenSwordRainCount: 5,
  // --- waves ---
  waves: [
    { name: 'WAVE 1 — TỐT ĐEN', spawn: ['pawn', 'pawn', 'pawn'] },
    { name: 'WAVE 2 — MÃ + TƯỢNG', spawn: ['knight', 'bishop', 'pawn', 'pawn'] },
    { name: 'WAVE 3 — XE + SÁT THỦ', spawn: ['rook', 'bishop', 'assassin'] },
    { name: 'BOSS — THE QUEEN', spawn: ['queen'] },
  ],
  // --- misc ---
  pushbackBonus: 1,         // +damage when a pushed enemy hits edge/another enemy
  soulDropRecoverRadius: 1.4,
  cameraDistance: 7.5,
  cameraHeight: 3.6,
  pixelRatioCap: 1.5,
};

// ---------------------------------------------------------------------------
// Tiny DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function lockPointer() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { /* re-lock cooldown after Esc — harmless */ });
  } catch (err) { /* pointer lock unavailable — game still plays with keys */ }
}
const hud = $('hud'), timerEl = $('timer'), waveEl = $('wave-label');
const hpFill = $('hp-fill'), stFill = $('st-fill'), soulsEl = $('souls');
const healsEl = $('heals'), soulSlotEl = $('soul-slot'), tutorialEl = $('tutorial');
const bannerEl = $('banner'), toastEl = $('toast'), vignette = $('damage-vignette');
const bossWrap = $('boss-wrap'), bossFill = $('boss-fill');
const screens = {
  title: $('screen-title'), pause: $('screen-pause'), queen: $('screen-queen'),
  win: $('screen-win'), lose: $('screen-lose'),
};
function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
  if (!name) for (const el of Object.values(screens)) el.classList.add('hidden');
}
function showToast(text, ms = 2500) {
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
  swing: () => beep(300, 0.08, 'sawtooth', 0.06),
  hit: () => beep(180, 0.1, 'square', 0.12),
  hurt: () => { beep(110, 0.2, 'sawtooth', 0.15); },
  parry: () => { beep(880, 0.1, 'sine', 0.15); beep(1320, 0.16, 'sine', 0.12, 0.07); },
  telegraph: () => beep(1200, 0.09, 'sine', 0.07),
  die: () => beep(70, 0.4, 'sawtooth', 0.14),
  pickup: () => beep(660, 0.09, 'sine', 0.12),
  promotion: () => { beep(523, 0.12, 'sine', 0.14); beep(784, 0.2, 'sine', 0.14, 0.1); },
  wave: () => { beep(392, 0.14, 'triangle', 0.14); beep(523, 0.2, 'triangle', 0.14, 0.12); },
};

// ---------------------------------------------------------------------------
// Three.js scene
// ---------------------------------------------------------------------------
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120404);
scene.fog = new THREE.Fog(0x120404, 18, 46);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
scene.add(camera); // so a small light can ride with the camera if needed

// Warm key light (with shadows) + red rim light, like the video's dark-red mood.
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
const hemi = new THREE.HemisphereLight(0x8a5a4a, 0x1a0505, 0.5);
scene.add(hemi);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Board: 8x8 tiles, alternating dark red / near-black, plus edge glow.
// Tile centres run from -7..+7 (tileSize 2). Far rank (promotion) is z = -7.
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
// Ground beyond the board + glowing edge frame.
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
// Promotion tile (far rank, centre of the far edge) — glows when active.
const promoTile = new THREE.Mesh(
  new THREE.BoxGeometry(CONFIG.tileSize, 0.42, CONFIG.tileSize),
  new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.0 }));
promoTile.position.set(0, -0.1, -7);
scene.add(promoTile);
let promoActive = false;

// ---------------------------------------------------------------------------
// Procedural chess pieces (LatheGeometry profiles — the classic way to turn
// a chess piece). White = hero, black = enemies. Knight gets a stylised
// horse head from boxes/cones because a lathe cannot make a horse.
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
  // battlements
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
  for (let i = 0; i < 6; i++) { // crown points
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
  // Stylised horse head: lathe base + boxes/cones. Reads as a knight at
  // game distance; honest stylisation, not a real horse model.
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
  // Scale queens/kings/knights up a little so the hierarchy reads.
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
  sp.scale.set(1.6, 0.8, 1);
  return sp;
}
const floaters = [];
function spawnFloater(text, pos, color) {
  const sp = makeFloatingText(text, color);
  sp.position.copy(pos).add(new THREE.Vector3(0, 1.6, 0));
  scene.add(sp);
  floaters.push({ sp, life: 0.9 });
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const STATE = {
  phase: 'title',        // title | playing | paused | queenChoice | win | lose
  waveIndex: 0,
  time: 0,               // timer counting up (top centre), runs only while playing
  kills: 0,
  souls: 0,              // currency (parry +2, kill +5)
  soulDash: null,        // { type } — at most ONE Soul held (the last kill's)
  damageBuff: 1,         // promotion buff for the next wave
  tokensInUse: 0,        // attack-token accounting (see CONFIG.tokenCap)
  queenDefeated: false,
  waveCleared: false,    // set when the current wave's enemies are all dead
};
const player = {
  group: new THREE.Group(),
  hp: CONFIG.playerMaxHp,
  stamina: CONFIG.staminaMax,
  heals: CONFIG.healsPerWave,
  pos: new THREE.Vector3(0, 0, 5),
  vel: new THREE.Vector3(),
  yaw: 0,                // facing direction (radians, 0 = facing -Z, far rank)
  attackCd: 0, parryTimer: 0, blockHeld: false,
  rollTimer: 0, rollDir: new THREE.Vector3(),
  iframeTimer: 0, vulnerableTimer: 0, healCd: 0,
  dead: false,
};
let camYaw = 0, camPitch = 0.32;   // orbit camera; yaw 0 = camera behind player looking -Z
let damageBuffFlash = 0;

// Hero pawn + sword + shield (attached so the swing animation is visible).
const heroMesh = makePieceMesh('pawn', true);
player.group.add(heroMesh);
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
player.group.position.copy(player.pos);
scene.add(player.group);
// Faint diagonal-cone hint, shown briefly on every slash so the player can
// LEARN the diagonal-only rule instead of guessing why a hit missed.
const coneHintMat = new THREE.MeshBasicMaterial({
  color: 0xffd34d, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
const coneHint = new THREE.Group();
// Wedges centred on the two forward diagonals (local forward is -Z).
// A local circle angle phi maps to world (cos phi, 0, -sin phi), so the
// diagonals sit at phi = 45 deg and phi = 135 deg.
for (const startDeg of [20, 110]) {
  const cone = new THREE.Mesh(
    new THREE.CircleGeometry(CONFIG.attackRange, 20,
      THREE.MathUtils.degToRad(startDeg),
      THREE.MathUtils.degToRad(CONFIG.diagonalConeWidthDeg)), coneHintMat);
  cone.rotation.x = -Math.PI / 2;
  cone.position.y = 0.06;
  coneHint.add(cone);
}
coneHint.position.copy(player.pos);
scene.add(coneHint);
let coneHintTimer = 0;

// ---------------------------------------------------------------------------
// Input (pointer lock for mouse orbit; Esc releases the lock -> pause)
// ---------------------------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (STATE.phase === 'playing') {
    if (e.code === 'KeyH') tryHeal();
    if (e.code === 'KeyF') trySoulDash();
    if (e.code === 'Space') tryDodge();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  if (STATE.phase === 'playing' && document.pointerLockElement !== canvas) {
    lockPointer();
  }
});
document.addEventListener('pointerlockchange', () => {
  // Esc (or any lock loss) while playing = pause. The Start/Resume buttons
  // re-acquire the lock on click.
  if (document.pointerLockElement !== canvas && STATE.phase === 'playing') pauseGame();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || STATE.phase !== 'playing') return;
  camYaw -= e.movementX * 0.0028;
  camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0022, 0.08, 0.9);
});
canvas.addEventListener('mousedown', (e) => {
  if (STATE.phase !== 'playing') return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) tryAttack();
  if (e.button === 2) { player.parryTimer = CONFIG.parryWindow; player.blockHeld = true; }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) player.blockHeld = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
// Telegraphs (glowing tile / line / circle) — every dangerous attack gets one.
// ---------------------------------------------------------------------------
const telegraphs = [];
function addTelegraph(kind, pos, opts = {}) {
  let mesh;
  const color = opts.color || 0xff2211;
  if (kind === 'circle') {
    mesh = new THREE.Mesh(new THREE.CircleGeometry(opts.radius || 2, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
  } else if (kind === 'line') {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width || 1.2, opts.length || 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = opts.angle || 0;
  } else { // 'tile'
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.tileSize, CONFIG.tileSize),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
  }
  mesh.position.set(pos.x, 0.08, pos.z);
  scene.add(mesh);
  const t = { mesh, life: opts.life || 1, maxLife: opts.life || 1, onDone: opts.onDone || null, pulse: 0 };
  telegraphs.push(t);
  if (opts.sound !== false) sfx.telegraph();
  return t;
}
function updateTelegraphs(dt) {
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const t = telegraphs[i];
    t.life -= dt; t.pulse += dt * 10;
    t.mesh.material.opacity = 0.25 + 0.25 * Math.abs(Math.sin(t.pulse));
    if (t.life <= 0) {
      scene.remove(t.mesh);
      t.mesh.material.dispose();
      telegraphs.splice(i, 1);
      if (t.onDone) t.onDone();
    }
  }
}

// ---------------------------------------------------------------------------
// Projectiles + particle shatter on enemy death
// ---------------------------------------------------------------------------
const projectiles = [];
function spawnProjectile(from, dir, speed, dmg, isEnemy) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshBasicMaterial({ color: isEnemy ? 0xff5533 : 0xffd34d }));
  m.position.copy(from).add(new THREE.Vector3(0, 1.1, 0));
  scene.add(m);
  projectiles.push({ mesh: m, dir: dir.clone().normalize(), speed, dmg, isEnemy, life: 4 });
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
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.sp.position.y += dt * 1.2;
    f.sp.material.opacity = Math.max(0, f.life / 0.9);
    if (f.life <= 0) { scene.remove(f.sp); floaters.splice(i, 1); }
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
const enemies = [];
let droppedSouls = null; // { pos, amount } — dropped where the player died
function spawnPosFor(index, total) {
  // Spread spawns along the far half of the board (z negative = enemy side).
  const x = (index - (total - 1) / 2) * 3.2;
  return new THREE.Vector3(THREE.MathUtils.clamp(x, -6, 6), 0, -5 - (index % 2) * 1.5);
}
function createEnemy(type, pos) {
  const cfg = CONFIG.enemies[type];
  const group = new THREE.Group();
  group.add(makePieceMesh(type, false));
  // Red eyes so enemies read as hostile at a glance.
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), redEyeMat);
  eye.position.set(0, 1.25, 0.42); group.add(eye);
  group.position.copy(pos);
  scene.add(group);
  const e = {
    type, cfg, group, hp: cfg.hp, maxHp: cfg.hp,
    state: 'approach',       // approach | windup | attack | recover | stunned | circling | jumping
    stateT: 0, cooldown: 1 + Math.random(),
    tokenHeld: false, targetPos: new THREE.Vector3(),
    jumpFrom: new THREE.Vector3(), jumpTo: new THREE.Vector3(),
    dead: false, flashT: 0,
    // Queen-only
    aoeTimer: 4, summonTimer: 9,
  };
  enemies.push(e);
  return e;
}
function acquireToken(e) {
  if (STATE.tokensInUse >= CONFIG.tokenCap) return false;
  STATE.tokensInUse++; e.tokenHeld = true;
  return true;
}
function releaseToken(e) {
  if (e.tokenHeld) { STATE.tokensInUse = Math.max(0, STATE.tokensInUse - 1); e.tokenHeld = false; }
}
function damageEnemy(e, dmg, opts = {}) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flashT = 0.12;
  spawnFloater(String(Math.round(dmg)), e.group.position, opts.color || '#ffd34d');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  e.dead = true;
  releaseToken(e);
  shatter(e.group.position, 0x1a1420);
  scene.remove(e.group);
  sfx.die();
  STATE.kills++;
  STATE.souls += 5;
  // Soul-dash: the kill grants the victim's Soul (max 1 held — a new kill
  // replaces the old one). Queen's Soul is an omni-dash.
  STATE.soulDash = { type: e.type === 'assassin' ? 'knight' : e.type };
  showToast(`Nhặt được Soul: ${e.type.toUpperCase()} — nhấn F để Soul-dash`);
  sfx.pickup();
  if (e.type === 'queen') {
    STATE.queenDefeated = true;
    // Do NOT kill her narratively — the choice screen follows.
    setTimeout(() => { if (STATE.phase === 'playing') openQueenChoice(); }, 900);
  }
}
function pushbackEnemy(e, dir, fromPlayer) {
  // A slash knocks the enemy back; hitting the board edge or another enemy
  // deals +CONFIG.pushbackBonus damage to the one(s) hit (plan rule).
  const step = 1.2;
  const next = e.group.position.clone().addScaledVector(dir, step);
  const hitEdge = Math.abs(next.x) > BOARD_HALF - 0.5 || Math.abs(next.z) > BOARD_HALF - 0.5;
  let hitOther = null;
  if (!hitEdge) {
    for (const o of enemies) {
      if (o !== e && !o.dead && o.group.position.distanceTo(next) < 0.9) { hitOther = o; break; }
    }
  }
  e.group.position.copy(next);
  e.group.position.x = THREE.MathUtils.clamp(e.group.position.x, -BOARD_HALF + 0.6, BOARD_HALF - 0.6);
  e.group.position.z = THREE.MathUtils.clamp(e.group.position.z, -BOARD_HALF + 0.6, BOARD_HALF - 0.6);
  if (hitEdge || hitOther) {
    damageEnemy(e, CONFIG.pushbackBonus, { color: '#ff8844' });
    if (hitOther) damageEnemy(hitOther, CONFIG.pushbackBonus, { color: '#ff8844' });
    spawnFloater(`+${CONFIG.pushbackBonus} đẩy`, e.group.position, '#ff8844');
  }
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
function playerForward() {
  // Facing = camera yaw (the pawn turns with the camera, Dark Souls style).
  return new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
}
function isInDiagonalCone(targetPos) {
  // Is the target inside one of the two forward-diagonal cones?
  const to = targetPos.clone().sub(player.pos); to.y = 0;
  if (to.length() < 0.01) return false;
  const fwd = playerForward();
  const ang = Math.atan2(to.x, -to.z) - Math.atan2(fwd.x, -fwd.z); // signed, 0 = ahead
  // Normalise to [-PI, PI]
  const a = Math.atan2(Math.sin(ang), Math.cos(ang));
  const half = THREE.MathUtils.degToRad(CONFIG.diagonalConeWidthDeg / 2);
  const diag = Math.PI / 4; // 45°
  return Math.abs(Math.abs(a) - diag) <= half;
}
function tryAttack() {
  if (player.attackCd > 0 || player.rollTimer > 0 || player.vulnerableTimer > 0) return;
  if (player.stamina < CONFIG.staminaAttack) { showToast('Hết stamina!'); return; }
  player.stamina -= CONFIG.staminaAttack;
  player.attackCd = CONFIG.attackCooldown;
  coneHintTimer = 0.35;
  sfx.swing();
  // Sword swing animation: quick rotate, reset in the loop.
  sword.rotation.z = -2.2;
  const fwd = playerForward();
  let hitAny = false;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = e.group.position.distanceTo(player.pos);
    if (d > CONFIG.attackRange) continue;
    if (!isInDiagonalCone(e.group.position)) continue; // straight ahead = MISS
    hitAny = true;
    damageEnemy(e, CONFIG.playerDamage * STATE.damageBuff);
    const dir = e.group.position.clone().sub(player.pos).setY(0).normalize();
    pushbackEnemy(e, dir, true);
  }
  if (hitAny) sfx.hit();
  else showToast('Chém hụt — nhớ: kiếm chỉ trúng theo ĐƯỜNG CHÉO!');
  tutorialMark('attack');
}
function tryDodge() {
  if (player.rollTimer > 0 || player.stamina < CONFIG.staminaRoll || player.vulnerableTimer > 0) return;
  player.stamina -= CONFIG.staminaRoll;
  player.rollTimer = CONFIG.dodgeDuration;
  player.iframeTimer = CONFIG.dodgeIFrames;
  const mv = moveInputVector();
  player.rollDir.copy(mv.lengthSq() > 0.01 ? mv : playerForward());
  beep(220, 0.08, 'sine', 0.08);
  tutorialMark('dodge');
}
function moveInputVector() {
  const fwd = playerForward();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const v = new THREE.Vector3();
  if (keys['KeyW']) v.add(fwd);
  if (keys['KeyS']) v.sub(fwd);
  if (keys['KeyD']) v.add(right);
  if (keys['KeyA']) v.sub(right);
  return v.lengthSq() > 0 ? v.normalize() : v;
}
function tryHeal() {
  if (player.heals <= 0) { showToast('Hết lượt hồi máu ở wave này!'); return; }
  if (player.hp >= CONFIG.playerMaxHp) { showToast('Máu đã đầy!'); return; }
  player.heals--;
  player.hp = Math.min(CONFIG.playerMaxHp, player.hp + CONFIG.healAmount);
  beep(523, 0.15, 'sine', 0.14); beep(784, 0.2, 'sine', 0.12, 0.1);
  spawnFloater(`+${CONFIG.healAmount}`, player.pos, '#7dff9a');
}
function trySoulDash() {
  if (!STATE.soulDash) { showToast('Chưa có Soul — giết một quân địch để nhặt Soul!'); return; }
  const type = STATE.soulDash.type;
  STATE.soulDash = null;
  const fwd = playerForward();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  let dest = player.pos.clone();
  // Each Soul dashes in its piece's movement pattern — the whole point of
  // the system (and the real-time replacement for the old 1-use card).
  if (type === 'knight') dest.addScaledVector(fwd, 4).addScaledVector(right, 2.5); // L-blink
  else if (type === 'bishop') dest.addScaledVector(fwd, 3.5).addScaledVector(right, 3.5); // diagonal
  else dest.addScaledVector(fwd, CONFIG.soulDashDistance); // rook straight / queen omni / pawn forward
  dest.x = THREE.MathUtils.clamp(dest.x, -BOARD_HALF + 0.6, BOARD_HALF - 0.6);
  dest.z = THREE.MathUtils.clamp(dest.z, -BOARD_HALF + 0.6, BOARD_HALF - 0.6);
  // Damage anything passed through on the way (point-to-segment distance).
  const segDir = dest.clone().sub(player.pos);
  const segLenSq = Math.max(segDir.lengthSq(), 0.0001);
  for (const e of enemies) {
    if (e.dead) continue;
    const t = THREE.MathUtils.clamp(
      e.group.position.clone().sub(player.pos).dot(segDir) / segLenSq, 0, 1);
    const closest = player.pos.clone().addScaledVector(segDir, t);
    if (e.group.position.distanceTo(closest) < 1.2) {
      damageEnemy(e, CONFIG.soulDashDamage, { color: '#b78cff' });
    }
  }
  player.pos.copy(dest);
  player.iframeTimer = Math.max(player.iframeTimer, 0.3);
  beep(990, 0.12, 'sine', 0.12);
  tutorialMark('souldash');
}
function damagePlayer(dmg, sourcePos) {
  if (player.iframeTimer > 0 || player.rollTimer > 0 || player.dead || STATE.phase !== 'playing') return;
  // Timed parry: an attack landing inside the parry window stuns the
  // attacker instead of hurting the player.
  if (player.parryTimer > 0) {
    // Find the nearest attacking enemy and stun it.
    let best = null, bestD = 1e9;
    for (const e of enemies) {
      if (e.dead || (e.state !== 'attack' && e.state !== 'windup')) continue;
      const d = e.group.position.distanceTo(player.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      best.state = 'stunned'; best.stateT = CONFIG.parryStun; releaseToken(best);
      STATE.souls += CONFIG.parrySouls;
      sfx.parry();
      spawnFloater('PARRY!', player.pos, '#7db8ff');
      showToast(`Parry thành công! +${CONFIG.parrySouls} Souls`);
      tutorialMark('parry');
      return;
    }
  }
  if (player.blockHeld && player.stamina > 5) {
    // Blocking: 70% reduced damage, drains stamina.
    dmg *= 0.3;
    player.stamina = Math.max(0, player.stamina - 12);
    beep(200, 0.08, 'square', 0.1);
  } else {
    sfx.hurt();
  }
  player.hp -= dmg;
  vignette.style.boxShadow = 'inset 0 0 120px 40px rgba(192,57,43,.55)';
  setTimeout(() => { vignette.style.boxShadow = 'inset 0 0 120px 40px rgba(192,57,43,0)'; }, 180);
  spawnFloater(`-${Math.round(dmg)}`, player.pos, '#ff5544');
  if (player.hp <= 0) { player.hp = 0; onPlayerDeath(); }
}

// ---------------------------------------------------------------------------
// Enemy AI — one small state machine per enemy, gated by the token rule.
// ---------------------------------------------------------------------------
function updateEnemy(e, dt) {
  if (e.dead) return;
  e.cooldown -= dt;
  e.flashT = Math.max(0, e.flashT - dt);
  e.group.children[0].material = e.flashT > 0
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x661111 })
    : blackMat;
  const toPlayer = player.pos.clone().sub(e.group.position); toPlayer.y = 0;
  const dist = toPlayer.length();
  const dir = dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);
  // Face the player (except while jumping).
  if (e.state !== 'jumping') e.group.rotation.y = Math.atan2(dir.x, dir.z);

  switch (e.state) {
    case 'stunned':
      e.stateT -= dt;
      if (e.stateT <= 0) { e.state = 'approach'; e.cooldown = 1; }
      break;

    case 'approach': {
      // Queen has her own attack script (AoE + lines), handled below.
      if (e.type === 'queen') { updateQueen(e, dt, dist, dir); break; }
      // If in range and off cooldown, try to take an attack token.
      if (dist < e.cfg.range && e.cooldown <= 0) {
        if (acquireToken(e)) {
          e.state = 'windup'; e.stateT = e.cfg.windup;
          startWindup(e, dist, dir);
        } else {
          e.state = 'circling'; e.stateT = 0.8 + Math.random() * 0.8;
        }
      } else {
        // Walk toward the player, but stop at a polite distance and circle
        // if another enemy is already attacking (token rule in action).
        const stopDist = e.type === 'bishop' || e.type === 'rook' ? 5.5 : 1.7;
        if (dist > stopDist) {
          e.group.position.addScaledVector(dir, e.cfg.speed * dt);
        } else {
          e.state = 'circling'; e.stateT = 0.6;
        }
        clampToBoard(e.group.position);
      }
      break;
    }

    case 'circling': {
      e.stateT -= dt;
      // Strafe around the player while waiting for a token.
      const tangent = new THREE.Vector3(-dir.z, 0, dir.x);
      e.group.position.addScaledVector(tangent, e.cfg.speed * 0.6 * dt);
      if (dist < 1.4) e.group.position.addScaledVector(dir.clone().negate(), e.cfg.speed * dt);
      clampToBoard(e.group.position);
      if (e.stateT <= 0) e.state = 'approach';
      break;
    }

    case 'windup': {
      e.stateT -= dt;
      // Telegraph pulse: bob the piece so the wind-up reads clearly.
      e.group.position.y = 0.1 + 0.1 * Math.sin(e.stateT * 20);
      if (e.stateT <= 0) {
        e.group.position.y = 0;
        e.state = 'attack'; e.stateT = 0.25;
        executeAttack(e, dist, dir);
      }
      break;
    }

    case 'attack': {
      e.stateT -= dt;
      if (e.stateT <= 0) {
        releaseToken(e);
        e.state = 'recover'; e.stateT = 0.6;
      }
      break;
    }

    case 'recover': {
      e.stateT -= dt;
      if (e.stateT <= 0) { e.state = 'approach'; e.cooldown = CONFIG.enemyAttackCooldown; }
      break;
    }

    case 'jumping': {
      // Knight / Assassin L-jump: parabolic arc from jumpFrom to jumpTo.
      e.stateT -= dt;
      const t = THREE.MathUtils.clamp(1 - e.stateT / 0.45, 0, 1);
      e.group.position.lerpVectors(e.jumpFrom, e.jumpTo, t);
      e.group.position.y = Math.sin(t * Math.PI) * 2.2;
      if (t >= 1) {
        e.group.position.y = 0;
        releaseToken(e);
        if (e.group.position.distanceTo(player.pos) < 1.9) damagePlayer(e.cfg.dmg, e.group.position);
        e.state = 'recover'; e.stateT = 0.7;
        e.cooldown = CONFIG.enemyAttackCooldown;
      }
      break;
    }
  }
}
function clampToBoard(v) {
  v.x = THREE.MathUtils.clamp(v.x, -BOARD_HALF + 0.6, BOARD_HALF - 0.6);
  v.z = THREE.MathUtils.clamp(v.z, -BOARD_HALF + 0.6, BOARD_HALF - 0.6);
}
function startWindup(e, dist, dir) {
  // Per-type telegraph, shown during the wind-up so the player can react.
  if (e.type === 'pawn') {
    addTelegraph('circle', player.pos.clone(), { radius: 1.6, life: e.cfg.windup, color: 0x4488ff }); // blue = parryable
  } else if (e.type === 'bishop') {
    addTelegraph('circle', player.pos.clone(), { radius: 1.4, life: e.cfg.windup, color: 0xff2211 });
  } else if (e.type === 'rook') {
    // Glowing red line along the rook's charge line (~1s warning).
    const lineDir = Math.abs(dir.x) > Math.abs(dir.z)
      ? new THREE.Vector3(Math.sign(dir.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(dir.z));
    e.targetPos.copy(lineDir);
    const mid = e.group.position.clone().addScaledVector(lineDir, 4);
    addTelegraph('line', mid, { width: 1.4, length: 8, life: e.cfg.windup,
      angle: lineDir.x !== 0 ? Math.PI / 2 : 0 });
  } else if (e.type === 'knight' || e.type === 'assassin') {
    // L-landing marker: where the jump will land (near the player).
    const land = player.pos.clone().add(new THREE.Vector3(dir.x * 0.5, 0, dir.z * 0.5));
    e.jumpTo.copy(land); e.jumpFrom.copy(e.group.position);
    addTelegraph('tile', land, { life: e.cfg.windup, color: e.type === 'assassin' ? 0xff2211 : 0x4488ff });
  }
}
function executeAttack(e, dist, dir) {
  if (e.type === 'queen') {
    // Queen melee slash at the end of her wind-up.
    if (player.pos.distanceTo(e.group.position) < 2.6) damagePlayer(e.cfg.dmg, e.group.position);
    return;
  }
  if (e.type === 'pawn') {
    if (player.pos.distanceTo(e.group.position) < 2.1) damagePlayer(e.cfg.dmg, e.group.position);
  } else if (e.type === 'bishop') {
    // Diagonal projectile toward the player's position at fire time.
    const to = player.pos.clone().sub(e.group.position).setY(0).normalize();
    spawnProjectile(e.group.position, to, 8, e.cfg.dmg, true);
  } else if (e.type === 'rook') {
    // Straight-line charge along the telegraphed line.
    const lineDir = e.targetPos;
    e.group.position.addScaledVector(lineDir, 5);
    clampToBoard(e.group.position);
    if (player.pos.distanceTo(e.group.position) < 1.8) damagePlayer(e.cfg.dmg, e.group.position);
    // Leave a fading line behind the charge.
    addTelegraph('line', e.group.position.clone(), { width: 1.4, length: 5, life: 0.4,
      angle: lineDir.x !== 0 ? Math.PI / 2 : 0, sound: false });
  } else if (e.type === 'knight' || e.type === 'assassin') {
    e.state = 'jumping'; e.stateT = 0.45; // token released on landing
    return;
  }
}
function updateQueen(e, dt, dist, dir) {
  // Queen boss script: melee when close, AoE circles + line attacks at
  // range, sword rain from above below 50% HP. She does NOT use the token
  // system — she IS the fight — but her adds (none in this demo) would.
  e.aoeTimer -= dt; e.summonTimer -= dt;
  const enraged = e.hp < e.maxHp * 0.5;
  if (dist < e.cfg.range && e.cooldown <= 0) {
    e.state = 'windup'; e.stateT = e.cfg.windup;
    addTelegraph('circle', player.pos.clone(), { radius: 2.2, life: e.cfg.windup, color: 0xff2211 });
    return;
  }
  if (e.aoeTimer <= 0) {
    e.aoeTimer = enraged ? 3.2 : 4.5;
    // Ground AoE: red circle fills ~1.5s, then explodes.
    const c = player.pos.clone();
    addTelegraph('circle', c, {
      radius: CONFIG.queenAoeRadius, life: CONFIG.queenAoeDelay, color: 0xff2211,
      onDone: () => {
        if (STATE.phase !== 'playing') return;
        shatter(c.clone().setY(0), 0xff4422);
        beep(90, 0.3, 'sawtooth', 0.18);
        if (player.pos.distanceTo(c) < CONFIG.queenAoeRadius) damagePlayer(CONFIG.queenAoeDamage, c);
      },
    });
    // Extra circles when enraged.
    if (enraged) {
      const c2 = player.pos.clone().add(new THREE.Vector3(2.5, 0, 0));
      addTelegraph('circle', c2, {
        radius: CONFIG.queenAoeRadius, life: CONFIG.queenAoeDelay, color: 0xff2211, sound: false,
        onDone: () => {
          if (STATE.phase !== 'playing') return;
          if (player.pos.distanceTo(c2) < CONFIG.queenAoeRadius) damagePlayer(CONFIG.queenAoeDamage, c2);
        },
      });
    }
    return;
  }
  if (e.summonTimer <= 0 && enraged) {
    // "Summons swords from above": falling swords that explode on impact.
    e.summonTimer = 7;
    for (let i = 0; i < CONFIG.queenSwordRainCount; i++) {
      const p = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
      addTelegraph('tile', p, {
        life: 1.0, color: 0xff8800, sound: i === 0,
        onDone: () => {
          if (STATE.phase !== 'playing') return;
          shatter(p.clone().setY(0), 0xffaa33);
          if (player.pos.distanceTo(p) < 1.3) damagePlayer(15, p);
        },
      });
    }
    return;
  }
  if (dist > 2.4) {
    e.group.position.addScaledVector(dir, e.cfg.speed * dt);
    clampToBoard(e.group.position);
  }
}

// ---------------------------------------------------------------------------
// Waves, promotion, death / respawn
// ---------------------------------------------------------------------------
function startWave(i) {
  STATE.waveIndex = i;
  const w = CONFIG.waves[i];
  // Clear leftovers.
  for (const e of enemies) { if (!e.dead) { scene.remove(e.group); releaseToken(e); } }
  enemies.length = 0;
  STATE.tokensInUse = 0;
  promoActive = false;
  STATE.waveCleared = false;
  promoTile.material.opacity = 0;
  player.heals = CONFIG.healsPerWave;
  player.pos.set(0, 0, 5);
  player.group.position.copy(player.pos);
  player.hp = CONFIG.playerMaxHp;
  player.stamina = CONFIG.staminaMax;
  w.spawn.forEach((t, idx) => createEnemy(t, spawnPosFor(idx, w.spawn.length)));
  waveEl.textContent = w.name;
  bossWrap.classList.toggle('hidden', i !== CONFIG.waves.length - 1);
  showBanner(w.name);
  sfx.wave();
}
function checkWaveClear() {
  if (STATE.phase !== 'playing' || STATE.queenDefeated || STATE.waveCleared) return;
  // Note: dead enemies are spliced out of `enemies` in the main loop, so an
  // empty array IS the cleared state — do not test every(dead) here.
  if (enemies.length === 0) {
    STATE.waveCleared = true;
    if (STATE.waveIndex >= CONFIG.waves.length - 1) return; // Queen handled by choice
    // Promotion: a glowing tile lights up on the far rank.
    promoActive = true;
    promoTile.material.opacity = 0.85;
    showBanner('PHONG VƯƠNG — BƯỚC LÊN Ô VÀNG!');
    showToast('Bước lên ô vàng ở cuối bàn cờ để hồi máu + tăng dame wave sau.');
    sfx.promotion();
  }
}
function checkPromotion() {
  if (!promoActive) return;
  if (player.pos.distanceTo(new THREE.Vector3(0, 0, -7)) < 1.4) {
    promoActive = false;
    promoTile.material.opacity = 0;
    player.hp = CONFIG.playerMaxHp;
    STATE.damageBuff = CONFIG.playerDamageBuff;
    showToast(`Phong vương! Dame x${CONFIG.playerDamageBuff} cho wave sau.`);
    sfx.promotion();
    setTimeout(() => { if (STATE.phase === 'playing') startWave(STATE.waveIndex + 1); }, 1200);
  }
}
function onPlayerDeath() {
  player.dead = true;
  shatter(player.pos, 0xf2ead8);
  // Unspent Souls drop where you died; walk over them to recover.
  if (STATE.souls > 0) {
    droppedSouls = { pos: player.pos.clone(), amount: STATE.souls, mesh: null };
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x9b8cff }));
    m.position.copy(droppedSouls.pos).setY(0.6);
    scene.add(m);
    droppedSouls.mesh = m;
    STATE.souls = 0;
  }
  sfx.die();
  setTimeout(() => {
    if (STATE.phase !== 'playing') return;
    showScreen('lose');
    STATE.phase = 'lose';
    document.exitPointerLock?.();
  }, 900);
}
function retryWave() {
  // Respawn at the start of the current wave; enemies reset.
  player.dead = false;
  player.hp = CONFIG.playerMaxHp;
  player.stamina = CONFIG.staminaMax;
  player.iframeTimer = 1;
  showScreen(null);
  hud.classList.remove('hidden');
  STATE.phase = 'playing';
  startWave(STATE.waveIndex);
  lockPointer();
}
function fullRestart() {
  STATE.time = 0; STATE.kills = 0; STATE.souls = 0; STATE.soulDash = null;
  STATE.damageBuff = 1; STATE.queenDefeated = false; STATE.tokensInUse = 0;
  player.dead = false; player.hp = CONFIG.playerMaxHp; player.stamina = CONFIG.staminaMax;
  if (droppedSouls?.mesh) { scene.remove(droppedSouls.mesh); droppedSouls = null; }
  for (const p of [...projectiles]) { scene.remove(p.mesh); }
  projectiles.length = 0;
  for (const t of [...telegraphs]) { scene.remove(t.mesh); }
  telegraphs.length = 0;
  showScreen(null);
  hud.classList.remove('hidden');
  STATE.phase = 'playing';
  startWave(0);
  lockPointer();
}

// ---------------------------------------------------------------------------
// Tutorial prompts (in order, checked off as the player does each action)
// ---------------------------------------------------------------------------
const tutorialSteps = [
  { id: 'move', label: 'Di chuyển bằng W A S D' },
  { id: 'attack', label: 'Chém bằng chuột trái — nhớ chém CHÉO, không chém thẳng' },
  { id: 'dodge', label: 'Né lăn bằng Space (bất tử thoáng chốc)' },
  { id: 'parry', label: 'Parry bằng chuột phải đúng lúc địch đánh tới' },
  { id: 'souldash', label: 'Giết địch để nhặt Soul, rồi nhấn F để Soul-dash' },
];
const tutorialDone = new Set();
function renderTutorial() {
  tutorialEl.innerHTML = '<b>NHIỆM VỤ MỚI:</b><br>' +
    tutorialSteps.map((s) => `<div class="${tutorialDone.has(s.id) ? 'done' : ''}">☐ ${s.label}</div>`).join('');
}
function tutorialMark(id) {
  if (tutorialDone.has(id)) return;
  tutorialDone.add(id);
  renderTutorial();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
function updateHUD() {
  timerEl.textContent = fmtTime(STATE.time);
  hpFill.style.width = `${(player.hp / CONFIG.playerMaxHp) * 100}%`;
  stFill.style.width = `${(player.stamina / CONFIG.staminaMax) * 100}%`;
  soulsEl.textContent = STATE.souls;
  healsEl.textContent = player.heals;
  soulSlotEl.textContent = STATE.soulDash
    ? `Soul-dash (F): ${STATE.soulDash.type.toUpperCase()}`
    : 'Soul-dash (F): —';
  const q = enemies.find((e) => e.type === 'queen' && !e.dead);
  if (q) bossFill.style.width = `${Math.max(0, (q.hp / q.maxHp) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Screens wiring
// ---------------------------------------------------------------------------
function startGame() {
  fullRestart();
}
function pauseGame() {
  if (STATE.phase !== 'playing') return;
  STATE.phase = 'paused';
  showScreen('pause');
  document.exitPointerLock?.();
}
function resumeGame() {
  showScreen(null);
  STATE.phase = 'playing';
  lockPointer();
}
function openQueenChoice() {
  STATE.phase = 'queenChoice';
  showScreen('queen');
  document.exitPointerLock?.();
}
function endGame(captured) {
  STATE.phase = 'win';
  $('win-title').textContent = 'CHECKMATE';
  $('win-text').textContent = captured
    ? 'KẾT THẬT — Bạn bắt sống Hậu. Vua mất đi người bảo vệ cuối cùng, và vương quốc mới của quân tốt bắt đầu từ chính bàn cờ này. (Chương 3 hoàn thành: cướp Hậu, không giết Hậu.)'
    : 'KẾT BÁO THÙ — Bạn kết liễu Hậu. Vua sẽ phải trả giá, nhưng vương quốc mới sẽ không bao giờ có Hậu. Chiến thắng, nhưng đắng.';
  showScreen('win');
}
$('btn-start').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-restart-pause').addEventListener('click', fullRestart);
$('btn-capture').addEventListener('click', () => endGame(true));
$('btn-execute').addEventListener('click', () => endGame(false));
$('btn-again-win').addEventListener('click', fullRestart);
$('btn-retry').addEventListener('click', retryWave);
$('btn-again-lose').addEventListener('click', fullRestart);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && STATE.phase === 'paused') resumeGame();
});
renderTutorial();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (STATE.phase === 'playing') {
    STATE.time += dt;

    // --- timers ---
    player.attackCd = Math.max(0, player.attackCd - dt);
    player.parryTimer = Math.max(0, player.parryTimer - dt);
    player.iframeTimer = Math.max(0, player.iframeTimer - dt);
    player.vulnerableTimer = Math.max(0, player.vulnerableTimer - dt);
    coneHintTimer = Math.max(0, coneHintTimer - dt);
    coneHintMat.opacity = coneHintTimer > 0 ? 0.35 : 0;
    damageBuffFlash = Math.max(0, damageBuffFlash - dt);

    // --- movement (dodge roll overrides normal movement) ---
    if (player.rollTimer > 0) {
      player.rollTimer -= dt;
      player.pos.addScaledVector(player.rollDir, CONFIG.dodgeSpeed * dt);
      player.group.rotation.x = Math.sin((1 - player.rollTimer / CONFIG.dodgeDuration) * Math.PI) * 0.9;
    } else {
      player.group.rotation.x = 0;
      const mv = moveInputVector();
      const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
      const speed = sprinting && player.stamina > 0 ? CONFIG.playerSprintSpeed : CONFIG.playerSpeed;
      if (mv.lengthSq() > 0) {
        player.pos.addScaledVector(mv, speed * dt);
        player.yaw = Math.atan2(mv.x, mv.z);
        tutorialMark('move');
        if (sprinting) player.stamina = Math.max(0, player.stamina - CONFIG.staminaSprintDrain * dt);
      }
      // Face the camera direction when idle/attacking (so slashes go where
      // the player is looking); face movement direction while moving.
      if (mv.lengthSq() > 0) {
        player.group.rotation.y = player.yaw;
      } else {
        const f = playerForward();
        player.group.rotation.y = Math.atan2(f.x, f.z);
      }
    }
    clampToBoard(player.pos);
    player.pos.y = 0;
    player.group.position.copy(player.pos);

    // --- stamina: regen when not sprinting/blocking; empty = vulnerable ---
    const draining = (keys['ShiftLeft'] || keys['ShiftRight']) || player.blockHeld;
    if (!draining && player.rollTimer <= 0) {
      player.stamina = Math.min(CONFIG.staminaMax, player.stamina + CONFIG.staminaRegen * dt);
    }
    if (player.blockHeld) player.stamina = Math.max(0, player.stamina - CONFIG.staminaBlockDrain * dt);
    if (player.stamina <= 0 && player.vulnerableTimer <= 0) {
      player.vulnerableTimer = CONFIG.staminaEmptyPenalty;
      showToast('Kiệt sức! Không thể hành động…');
    }
    // Sword swing animation easing back.
    sword.rotation.z += (-0.5 - sword.rotation.z) * Math.min(1, dt * 12);
    // Shield raises while blocking.
    shield.position.x = player.blockHeld ? -0.35 : -0.55;
    shield.position.z = player.blockHeld ? 0.45 : 0.15;

    // --- enemies, projectiles, telegraphs ---
    for (const e of [...enemies]) updateEnemy(e, dt);
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      const hitR = p.isEnemy ? player.pos.distanceTo(p.mesh.position) < 0.9 : 0;
      if (p.isEnemy && hitR) {
        damagePlayer(p.dmg, p.mesh.position);
        scene.remove(p.mesh); projectiles.splice(i, 1); continue;
      }
      if (p.life <= 0 || Math.abs(p.mesh.position.x) > 12 || Math.abs(p.mesh.position.z) > 12) {
        scene.remove(p.mesh); projectiles.splice(i, 1);
      }
    }
    updateTelegraphs(dt);
    // Dropped Souls recovery.
    if (droppedSouls && player.pos.distanceTo(droppedSouls.pos) < CONFIG.soulDropRecoverRadius) {
      STATE.souls += droppedSouls.amount;
      showToast(`Nhặt lại ${droppedSouls.amount} Souls!`);
      sfx.pickup();
      scene.remove(droppedSouls.mesh);
      droppedSouls = null;
    }
    if (droppedSouls?.mesh) droppedSouls.mesh.position.y = 0.6 + Math.sin(STATE.time * 3) * 0.15;
    checkWaveClear();
    checkPromotion();
    updateHUD();
  } else {
    // Idle motion on menus: slow camera drift + pieces idle (cheap, alive).
    updateTelegraphs(dt);
  }

  updateFragments(dt);
  updateFloaters(dt);
  // Promotion tile pulse.
  if (promoActive) promoTile.material.opacity = 0.55 + 0.3 * Math.sin(STATE.time * 4 || performance.now() / 250);

  // --- third-person camera: behind the pawn, orbit with the mouse ---
  const camDist = CONFIG.cameraDistance;
  const cx = player.pos.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
  const cz = player.pos.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
  const cy = player.pos.y + CONFIG.cameraHeight * 0.6 + Math.sin(camPitch) * camDist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
  // Cone hint follows the pawn and rotates with the camera facing.
  coneHint.position.copy(player.pos);
  coneHint.rotation.y = camYaw; // local -Z maps to the camera forward

  renderer.render(scene, camera);
}
animate();
