import * as THREE from "three";
import enemyData from "../data/enemies.json";
import prog from "../data/progression.json";
import combatCfg from "../data/combat.json";
import { buildWorld, WORLD_RADIUS } from "./game/world";
import { makePlayerMesh, makeEnemyMesh } from "./game/actors";
import { Fx } from "./game/fx";
import { sfx } from "./game/sfx";
import { computeDamage, rollRange } from "./logic/combat";
import { expToNext, gainExp, type LevelState } from "./logic/progression";
import { derive, allocate, emptyAttrs, ATTR_KEYS, type AttrKey, type Attrs } from "./logic/stats";
import { serialize, deserialize } from "./logic/save";
import { generateItem, rollDrop, equipFromInventory, unequip, equipmentStats, rarityOf, formatStat, itemScore, slotsFor, SLOT_IDS, ITEM_CFG, type Item, type Equipment, type SlotId, type StatKey } from "./logic/items";
import { makeStamina, spend, regen, isInvulnerable } from "./logic/stamina";
import { resolveCircle } from "./logic/collision";
import { makePoise, hitPoise, tickPoise, isStaggered, heavyMultipliers, type Poise } from "./logic/poise";
import { weightedPick } from "./logic/spawn";

// ---------- 기본 세팅 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById("app")!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
const world = buildWorld(scene);
const fx = new Fx(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const AC = combatCfg.attack, HC = combatCfg.heavy, DC = combatCfg.dodge, PC = combatCfg.poise;

// ---------- 플레이어 ----------
const { root: playerMesh, sword } = makePlayerMesh();
scene.add(playerMesh);
const playerLight = new THREE.PointLight("#ffb366", 6, 7, 1.5);
playerLight.position.y = 1.4;
playerMesh.add(playerLight);

const player = {
  pos: new THREE.Vector3(0, 0, 3),
  facing: 0,
  lv: { level: 1, exp: 0, statPoints: 0 } as LevelState,
  hp: prog.base.hp,
  maxHp: prog.base.hp,
  atk: prog.base.atk,
  def: prog.base.def,
  gold: 0,
  attackT: 0, // 공격 모션 남은 시간
  attackKind: "light" as "light" | "heavy",
  attackCd: 0,
  charging: false,
  chargeT: 0,
  hurtT: 0,
  dead: false,
  stamina: makeStamina(combatCfg.stamina),
  dodgeT: null as number | null, // 회피 시작 후 경과 시간 (null = 회피 중 아님)
  dodgeDir: new THREE.Vector3(),
  dodgeCd: 0,
  attrs: emptyAttrs() as Attrs,
  inventory: [] as Item[],
  equipment: {} as Equipment,
  crit: AC.critChance,
  dodgeCostMul: 1,
};
const PLAYER_RADIUS = 0.4;

// 레벨·속성 → 능력치 반영
function applyDerived(fullHeal: boolean) {
  const d = derive(player.lv.level, player.attrs, equipmentStats(player.equipment));
  const hpRatio = player.hp / player.maxHp;
  player.maxHp = d.maxHp;
  player.atk = d.atk;
  player.def = d.def;
  player.crit = d.critChance;
  player.dodgeCostMul = d.dodgeCostMul;
  player.stamina.max = d.maxStamina;
  player.hp = fullHeal ? d.maxHp : Math.max(1, Math.round(d.maxHp * hpRatio));
}

// ---------- 저장/불러오기 ----------
const SAVE_KEY = "emberlands.save";
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, serialize({ level: player.lv.level, exp: player.lv.exp, statPoints: player.lv.statPoints, attrs: player.attrs, gold: player.gold, inventory: player.inventory, equipment: player.equipment }));
  } catch { /* 저장 불가 환경(시크릿 모드 등)은 무시 */ }
}
function loadGame(): boolean {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return false; }
  const d = deserialize(raw, prog.maxLevel, ITEM_CFG.inventorySize);
  if (!d) return false;
  player.inventory = d.inventory;
  player.equipment = d.equipment;
  player.lv = { level: d.level, exp: d.exp, statPoints: d.statPoints };
  player.attrs = d.attrs;
  player.gold = d.gold;
  return true;
}
const loaded = new URLSearchParams(location.search).has("fresh") ? false : loadGame();
if (!loaded) player.equipment = { weapon: generateItem(Math.random, 1, { baseId: "rustySword", rarity: "common" }) };
applyDerived(true);
setInterval(saveGame, 10000);
addEventListener("beforeunload", saveGame);

// ---------- 카메라 ----------
const cam = { yaw: 0, dist: 15.5, height: 10.5, target: null as Enemy | null };
const camForward = () => new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));

// ---------- 적 ----------
type EnemyId = keyof typeof enemyData;
type EnemyDef = (typeof enemyData)[EnemyId] & Partial<{ preferredRange: number; projectileSpeed: number; chargeSpeed: number; chargeTime: number }>;
type EState = "wander" | "chase" | "windup" | "attack" | "recover" | "stagger" | "dead";
interface Enemy {
  id: EnemyId;
  def: EnemyDef;
  mesh: ReturnType<typeof makeEnemyMesh>;
  pos: THREE.Vector3;
  hp: number;
  poise: Poise;
  state: EState;
  t: number;
  wanderDir: number;
  attackCd: number;
  flashT: number;
  respawnT: number;
  chargeDir: THREE.Vector3;
  hitPlayer: boolean;
  hpBar: THREE.Mesh;
}
const enemies: Enemy[] = [];
const ENEMY_COUNT = 14;
const weights = Object.fromEntries(Object.entries(enemyData).map(([k, v]) => [k, v.spawnWeight])) as Record<EnemyId, number>;

function spawnPoint(): THREE.Vector3 {
  const r = 12 + Math.random() * (WORLD_RADIUS - 14);
  const th = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
}

const hpBarGeo = new THREE.PlaneGeometry(1, 0.09);
function createEnemy(id: EnemyId, pos: THREE.Vector3): Enemy {
  const def = enemyData[id] as EnemyDef;
  const mesh = makeEnemyMesh(def.color, def.eyeColor, def.size, def.ai);
  const hpBar = new THREE.Mesh(hpBarGeo, new THREE.MeshBasicMaterial({ color: "#e2553c", depthTest: false, transparent: true }));
  hpBar.renderOrder = 10;
  hpBar.visible = false;
  scene.add(mesh.root, hpBar);
  const e: Enemy = {
    id, def, mesh, pos: pos.clone(), hp: def.hp, poise: makePoise({ ...PC, max: def.poise }), state: "wander", t: 0,
    wanderDir: Math.random() * 6.28, attackCd: 0, flashT: 0, respawnT: 0, chargeDir: new THREE.Vector3(), hitPlayer: false, hpBar,
  };
  mesh.root.position.copy(e.pos);
  enemies.push(e);
  return e;
}
function respawn(e: Enemy) {
  e.pos.copy(spawnPoint());
  e.hp = e.def.hp;
  e.poise = makePoise({ ...PC, max: e.def.poise });
  e.state = "wander";
  e.mesh.root.visible = true;
  e.mesh.root.scale.setScalar(1);
}
for (let i = 0; i < ENEMY_COUNT; i++) createEnemy(weightedPick(weights, Math.random()), spawnPoint());
// 첫 화면에서 바로 보이도록 세 종류를 가까이 배치
createEnemy("ashCrawler", new THREE.Vector3(-3, 0, 9));
createEnemy("ashCrawler", new THREE.Vector3(1, 0, 10));
createEnemy("ashSpitter", new THREE.Vector3(5, 0, 14));
createEnemy("ashCharger", new THREE.Vector3(-6, 0, 15));

// ---------- 투사체 ----------
interface Projectile { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; dmg: number }
const projectiles: Projectile[] = [];
const projGeo = new THREE.SphereGeometry(0.22, 10, 8);
const projMat = new THREE.MeshStandardMaterial({ color: "#9cff6c", emissive: "#6cff3c", emissiveIntensity: 2 });
function fireProjectile(e: Enemy) {
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(e.pos).setY(1.0);
  const target = player.pos.clone().setY(1.0);
  const vel = target.sub(mesh.position).normalize().multiplyScalar(e.def.projectileSpeed ?? 8);
  scene.add(mesh);
  projectiles.push({ mesh, vel, life: 2.5, dmg: computeDamage({ atk: e.def.atk, def: player.def }).amount });
  sfx.spit();
}
function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    let gone = p.life <= 0;
    const dx = p.mesh.position.x - player.pos.x, dz = p.mesh.position.z - player.pos.z;
    if (!gone && !player.dead && dx * dx + dz * dz < 0.55 * 0.55) {
      if (isInvulnerable(player.dodgeT, DC.iframe)) floater(player.pos.clone().setY(2), "회피!", "exp");
      else hurtPlayer(p.dmg);
      gone = true;
    }
    for (const o of world.obstacles) {
      const ox = p.mesh.position.x - o.x, oz = p.mesh.position.z - o.z;
      if (ox * ox + oz * oz < o.r * o.r) gone = true;
    }
    if (gone) {
      fx.burst(p.mesh.position, "#9cff6c", 6, 2.5);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

// ---------- 입력 ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyJ") tryAttack();
  if (e.code === "KeyK") startCharge();
  if (e.code === "Space") { e.preventDefault(); tryDodge(); }
  if (e.code === "Tab") { e.preventDefault(); toggleLockOn(); }
  if (e.code === "KeyC") toggleCharPanel();
  if (e.code === "KeyI") toggleInvPanel();
});
addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyK") releaseCharge();
});
const canvas = renderer.domElement;
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
let dragging = false;
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) tryAttack();
  if (e.button === 2) startCharge();
  if (e.button === 1) { dragging = true; e.preventDefault(); }
});
addEventListener("mouseup", (e) => {
  if (e.button === 2) releaseCharge();
  if (e.button === 1) dragging = false;
});
addEventListener("mousemove", (e) => {
  if (dragging) { cam.yaw -= e.movementX * 0.006; cam.target = null; }
});
canvas.addEventListener("wheel", (e) => {
  cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 9, 24);
  cam.height = cam.dist * 0.68;
});

function moveInput(): THREE.Vector3 {
  const f = camForward();
  const r = new THREE.Vector3(-f.z, 0, f.x); // 화면 오른쪽
  const v = new THREE.Vector3();
  if (keys.has("KeyW")) v.add(f);
  if (keys.has("KeyS")) v.sub(f);
  if (keys.has("KeyD")) v.sub(r);
  if (keys.has("KeyA")) v.add(r);
  return v;
}

function faceTarget() {
  if (cam.target && cam.target.state !== "dead") {
    const to = cam.target.pos.clone().sub(player.pos);
    player.facing = Math.atan2(to.x, to.z);
  }
}

function tryDodge() {
  if (player.dead || player.dodgeT !== null || player.dodgeCd > 0) return;
  if (!spend(player.stamina, DC.staminaCost * player.dodgeCostMul)) return flashStamina();
  const dir = moveInput();
  if (dir.lengthSq() === 0) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
  player.dodgeDir.copy(dir.normalize());
  player.facing = Math.atan2(dir.x, dir.z);
  player.dodgeT = 0;
  player.attackT = 0;
  player.charging = false;
  sfx.dodge();
}

function tryAttack() {
  if (player.dead || player.attackCd > 0 || player.dodgeT !== null || player.charging) return;
  if (!spend(player.stamina, AC.staminaCost)) return flashStamina();
  faceTarget();
  player.attackKind = "light";
  player.attackT = AC.time;
  player.attackCd = AC.cooldown;
  sfx.swing();
  strike(AC.range, AC.arcDeg, 1, AC.poiseDamage, AC.hitstop, false);
}

function startCharge() {
  if (player.dead || player.attackCd > 0 || player.dodgeT !== null || player.charging) return;
  if (player.stamina.value <= 0) return flashStamina();
  player.charging = true;
  player.chargeT = 0;
  sfx.charge();
}

function releaseCharge() {
  if (!player.charging) return;
  player.charging = false;
  if (!spend(player.stamina, HC.staminaCost)) return flashStamina();
  faceTarget();
  const { dmgMul, poiseDmg } = heavyMultipliers(player.chargeT / HC.maxCharge, HC);
  player.attackKind = "heavy";
  player.attackT = HC.time;
  player.attackCd = HC.cooldown;
  sfx.heavySwing();
  strike(HC.range, HC.arcDeg, dmgMul, poiseDmg, HC.hitstop, true);
}

function strike(range: number, arcDeg: number, mul: number, poiseDmg: number, hitstop: number, heavy: boolean) {
  const fwd = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  const arc = Math.cos((arcDeg / 2) * (Math.PI / 180));
  let hitAny = false;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    const to = e.pos.clone().sub(player.pos).setY(0);
    const d = to.length();
    if (d > range + e.def.size * 0.6) continue;
    if (d > 0.3 && to.normalize().dot(fwd) < arc) continue;
    const staggered = isStaggered(e.poise);
    const r = computeDamage({ atk: player.atk, def: e.def.def, skillMul: mul, critChance: player.crit, staggered });
    const broke = hitPoise(e.poise, poiseDmg, { ...PC, max: e.def.poise });
    hitEnemy(e, r.amount, r.crit || staggered, heavy, broke);
    hitAny = true;
  }
  if (hitAny) {
    fx.addHitstop(hitstop);
    fx.addShake(heavy ? 0.7 : 0.35);
    heavy ? sfx.heavyHit() : sfx.hit();
  }
}

function hitEnemy(e: Enemy, amount: number, crit: boolean, heavy: boolean, broke: boolean) {
  e.hp -= amount;
  e.flashT = 0.12;
  floater(e.pos.clone().setY(1.6 + e.def.size * 0.4), String(amount), crit ? "crit" : "");
  fx.burst(e.pos.clone().setY(0.8), "#ffb347", heavy ? 10 : 5, heavy ? 5 : 3.5);
  const push = e.pos.clone().sub(player.pos).setY(0).normalize().multiplyScalar((heavy ? 1.1 : 0.5) / Math.max(0.7, e.def.size));
  e.pos.add(push);
  if (broke) {
    e.state = "stagger";
    e.t = 0;
    floater(e.pos.clone().setY(2.4), "그로기!", "crit");
    sfx.stagger();
  } else if (e.state === "wander") e.state = "chase";
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e: Enemy) {
  e.state = "dead";
  e.t = 0;
  e.respawnT = 8;
  e.hpBar.visible = false;
  if (cam.target === e) cam.target = null;
  fx.burst(e.pos.clone().setY(0.6), e.def.eyeColor, 18, 5);
  fx.burst(e.pos.clone().setY(0.6), "#2a2433", 10, 3);
  sfx.kill();
  const gold = rollRange(e.def.gold as [number, number]);
  player.gold += gold;
  const r = gainExp(player.lv, e.def.exp);
  player.lv = r.state;
  floater(e.pos.clone().setY(2.2), `+${e.def.exp} EXP  ◆${gold}`, "exp");
  if (r.levelsGained > 0) onLevelUp();
  const drop = rollDrop(Math.random, e.def.level, e.def.dropChance);
  if (drop) spawnLoot(drop, e.pos);
}

function onLevelUp() {
  applyDerived(true);
  toast(`레벨 업!  Lv ${player.lv.level}  —  C: 능력치 배분`);
  saveGame();
  renderCharPanel();
  fx.burst(player.pos.clone().setY(1), "#ffcc66", 30, 6);
  sfx.levelUp();
}

function toggleLockOn() {
  if (cam.target) { cam.target = null; return; }
  let best: Enemy | null = null, bd = 16;
  const f = camForward();
  for (const e of enemies) {
    if (e.state === "dead") continue;
    const to = e.pos.clone().sub(player.pos);
    const d = to.length();
    const score = d * (1.5 - to.normalize().dot(f) * 0.5); // 화면 앞쪽 우선
    if (d < 16 && score < bd) { bd = score; best = e; }
  }
  cam.target = best;
}

// ---------- 바닥 전리품 ----------
interface Loot { item: Item; group: THREE.Group; t: number }
const loots: Loot[] = [];
const lootBoxGeo = new THREE.OctahedronGeometry(0.22, 0);
const beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 3, 8, 1, true);
beamGeo.translate(0, 1.5, 0);
function spawnLoot(item: Item, at: THREE.Vector3) {
  const color = rarityOf(item.rarity).color;
  const g = new THREE.Group();
  const gem = new THREE.Mesh(lootBoxGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
  gem.position.y = 0.5;
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(gem, beam);
  g.position.set(at.x + (Math.random() - 0.5), 0, at.z + (Math.random() - 0.5));
  scene.add(g);
  loots.push({ item, group: g, t: 0 });
}
function updateLoot(dt: number) {
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    l.t += dt;
    const gem = l.group.children[0];
    gem.rotation.y += dt * 2;
    gem.position.y = 0.5 + Math.sin(l.t * 3) * 0.1;
    if (player.dead || l.t < 0.4) continue;
    const dx = l.group.position.x - player.pos.x, dz = l.group.position.z - player.pos.z;
    if (dx * dx + dz * dz < 1.6 * 1.6) {
      if (player.inventory.length >= ITEM_CFG.inventorySize) {
        if (l.t % 2 < dt) floater(player.pos.clone().setY(2.3), "가방이 가득 찼다", "hurt");
        continue;
      }
      player.inventory.push(l.item);
      const r = rarityOf(l.item.rarity);
      floater(l.group.position.clone().setY(1.4), `${l.item.name} [${r.name}]`, `loot r-${l.item.rarity}`);
      sfx.pickup();
      scene.remove(l.group);
      loots.splice(i, 1);
      saveGame();
      renderInvPanel();
    }
  }
}

// ---------- 인벤토리 창 (I) ----------
function toggleInvPanel() {
  $("invPanel").classList.toggle("open");
  renderInvPanel();
}
function itemTooltip(it: Item, compare?: Item): string {
  const r = rarityOf(it.rarity);
  const lines = (Object.entries(it.stats) as [StatKey, number][]).map(([k, v]) => {
    let diff = "";
    if (compare) {
      const d = v - (compare.stats[k] ?? 0);
      if (Math.abs(d) > 1e-9) diff = ` <span class="${d > 0 ? "up" : "down"}">(${d > 0 ? "▲" : "▼"})</span>`;
    }
    return `<div>${formatStat(k, v)}${diff}</div>`;
  });
  const slot = slotsFor(it.kind).map((s) => ITEM_CFG.slotNames[s]).join("/");
  return `<div class="tt-name" style="color:${r.color}">${it.name}</div>
    <div class="tt-sub">${r.name} · ${slot} · 아이템 레벨 ${it.ilvl}</div>${lines.join("")}
    ${it.affixes.length ? `<div class="tt-sub">부가옵션 ${it.affixes.length}개 포함</div>` : ""}
    ${compare ? `<div class="tt-sub">착용 중: ${compare.name} (점수 ${Math.round(itemScore(compare))} → ${Math.round(itemScore(it))})</div>` : ""}`;
}
function renderInvPanel() {
  const el = $("invPanel");
  if (!el.classList.contains("open")) return;
  const eq = player.equipment;
  el.innerHTML = `
    <h3>장비 · 가방 <span class="cap">${player.inventory.length}/${ITEM_CFG.inventorySize}</span></h3>
    <div class="inv-wrap">
      <div class="slots">${SLOT_IDS.map((s) => {
        const it = eq[s];
        return `<div class="slot ${it ? "filled" : ""}" data-slot="${s}" style="${it ? `border-color:${rarityOf(it.rarity).color}` : ""}">
          <span class="sl">${ITEM_CFG.slotNames[s]}</span><span class="sn" style="${it ? `color:${rarityOf(it.rarity).color}` : ""}">${it ? it.name : "—"}</span></div>`;
      }).join("")}</div>
      <div class="grid">${Array.from({ length: ITEM_CFG.inventorySize }, (_, i) => {
        const it = player.inventory[i];
        if (!it) return `<div class="cell"></div>`;
        const c = rarityOf(it.rarity).color;
        return `<div class="cell item" data-i="${i}" style="border-color:${c};box-shadow: inset 0 0 10px ${c}55"><span>${it.name.slice(0, 2)}</span></div>`;
      }).join("")}</div>
    </div>
    <div id="tooltip" class="tooltip">아이템에 마우스를 올리면 정보가 보인다. 클릭: 장착 / 장착칸 클릭: 해제</div>
    <div class="hint">I 닫기</div>`;
  const tt = el.querySelector("#tooltip") as HTMLElement;
  el.querySelectorAll<HTMLElement>(".cell.item").forEach((c) => {
    const it = player.inventory[Number(c.dataset.i)];
    // 빈 칸이 있으면 비교 대상 없음, 아니면 교체될 장비와 비교
    const slots = slotsFor(it.kind);
    const cur = slots.some((s) => !player.equipment[s]) ? undefined : player.equipment[slots[0]];
    c.addEventListener("mouseenter", () => (tt.innerHTML = itemTooltip(it, cur)));
    c.addEventListener("click", () => {
      const r = equipFromInventory(player.equipment, player.inventory, Number(c.dataset.i));
      if (!r) return;
      player.equipment = r.eq;
      player.inventory = r.inv;
      applyDerived(false);
      sfx.equip();
      saveGame();
      renderInvPanel();
      renderCharPanel();
    });
  });
  el.querySelectorAll<HTMLElement>(".slot.filled").forEach((c) => {
    const s = c.dataset.slot as SlotId;
    c.addEventListener("mouseenter", () => (tt.innerHTML = itemTooltip(player.equipment[s]!)));
    c.addEventListener("click", () => {
      const r = unequip(player.equipment, player.inventory, s, ITEM_CFG.inventorySize);
      if (!r) return toast("가방이 가득 찼다");
      player.equipment = r.eq;
      player.inventory = r.inv;
      applyDerived(false);
      saveGame();
      renderInvPanel();
      renderCharPanel();
    });
  });
}

// ---------- HUD ----------
const $ = (id: string) => document.getElementById(id)!;
let stFlashT = 0;
function flashStamina() { stFlashT = 0.4; }
function updateHud() {
  $("stFill").style.width = `${(player.stamina.value / player.stamina.max) * 100}%`;
  $("stFill").parentElement!.classList.toggle("empty", stFlashT > 0);
  $("lvl").textContent = String(player.lv.level);
  $("hpFill").style.width = `${(player.hp / player.maxHp) * 100}%`;
  $("hpText").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  const need = expToNext(player.lv.level);
  $("expFill").style.width = need === Infinity ? "100%" : `${(player.lv.exp / need) * 100}%`;
  $("gold").textContent = String(player.gold);
  $("spBadge").style.display = player.lv.statPoints > 0 ? "inline-block" : "none";
  $("spBadge").textContent = `+${player.lv.statPoints} (C)`;
  const ch = $("charge");
  ch.style.opacity = player.charging ? "1" : "0";
  ($("chargeFill") as HTMLElement).style.width = `${Math.min(1, player.chargeT / HC.maxCharge) * 100}%`;
  const tgt = $("target");
  if (cam.target && cam.target.state !== "dead") {
    tgt.style.display = "block";
    const p = cam.target.pos.clone().setY(cam.target.def.size * 2 + 0.6).project(camera);
    tgt.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    tgt.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    $("targetName").textContent = cam.target.def.name;
  } else tgt.style.display = "none";
}
// ---------- 캐릭터 창 (C) ----------
function toggleCharPanel() {
  const el = $("charPanel");
  el.classList.toggle("open");
  renderCharPanel();
}
function spendPoint(key: AttrKey) {
  const r = allocate(player.attrs, player.lv.statPoints, key);
  if (!r) return;
  player.attrs = r.attrs;
  player.lv = { ...player.lv, statPoints: r.points };
  applyDerived(false);
  saveGame();
  renderCharPanel();
}
function renderCharPanel() {
  const el = $("charPanel");
  if (!el.classList.contains("open")) return;
  const d = derive(player.lv.level, player.attrs);
  const A = prog.attributes as Record<AttrKey, { name: string; desc: string }>;
  el.innerHTML = `
    <h3>점화자 · Lv ${player.lv.level}</h3>
    <div class="pts">남은 포인트: <b>${player.lv.statPoints}</b></div>
    ${ATTR_KEYS.map((k) => `
      <div class="attr"><span class="nm">${A[k].name}</span><span class="val">${player.attrs[k]}</span>
        <button data-k="${k}" ${player.lv.statPoints > 0 ? "" : "disabled"}>+</button>
        <div class="desc">${A[k].desc}</div></div>`).join("")}
    <div class="derived">
      <div>최대 HP <b>${d.maxHp}</b></div><div>공격력 <b>${d.atk}</b></div>
      <div>방어력 <b>${d.def}</b></div><div>스태미나 <b>${d.maxStamina}</b></div>
      <div>치명타 <b>${(d.critChance * 100).toFixed(1)}%</b></div><div>회피 비용 <b>${Math.round(DC.staminaCost * d.dodgeCostMul)}</b></div>
    </div>
    <div class="hint">C 닫기 · 진행 상황은 자동 저장</div>`;
  el.querySelectorAll("button[data-k]").forEach((b) =>
    b.addEventListener("click", (ev) => { ev.stopPropagation(); spendPoint((b as HTMLElement).dataset.k as AttrKey); })
  );
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 1600);
}
interface Floater { el: HTMLElement; pos: THREE.Vector3; t: number }
const floaters: Floater[] = [];
function floater(pos: THREE.Vector3, text: string, cls: string) {
  const el = document.createElement("div");
  el.className = `dmg ${cls}`;
  el.textContent = text;
  $("floaters").appendChild(el);
  floaters.push({ el, pos, t: 0 });
}

// ---------- 갱신 ----------
const tmpV = new THREE.Vector3();

function updatePlayer(dt: number) {
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.dead) return;
  regen(player.stamina, player.charging ? 0 : dt, combatCfg.stamina);
  stFlashT = Math.max(0, stFlashT - dt);
  player.dodgeCd = Math.max(0, player.dodgeCd - dt);
  if (player.charging) player.chargeT = Math.min(HC.maxCharge, player.chargeT + dt);

  // 회피 구르기: 이동 입력 무시, 빠르게 미끄러지며 한 바퀴 구름
  if (player.dodgeT !== null) {
    player.dodgeT += dt;
    const k = player.dodgeT / DC.time;
    player.pos.addScaledVector(player.dodgeDir, DC.speed * (1 - k * 0.6) * dt);
    resolveCircle(player.pos, PLAYER_RADIUS, world.obstacles);
    playerMesh.position.copy(player.pos);
    playerMesh.position.y = Math.sin(Math.min(1, k) * Math.PI) * 0.25;
    playerMesh.rotation.set(Math.min(1, k) * Math.PI * 2, player.facing, 0, "YXZ");
    if (player.dodgeT >= DC.time) {
      player.dodgeT = null;
      player.dodgeCd = DC.cooldown;
      playerMesh.rotation.set(0, player.facing, 0);
    }
    return;
  }

  const dir = moveInput();
  const moving = dir.lengthSq() > 0;
  if (moving) {
    dir.normalize();
    let speed = prog.base.moveSpeed;
    if (player.attackT > 0) speed *= 0.35;
    if (player.charging) speed *= HC.moveSlow;
    player.pos.addScaledVector(dir, speed * dt);
    if (!cam.target) {
      const target = Math.atan2(dir.x, dir.z);
      let diff = target - player.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.facing += diff * Math.min(1, dt * 14);
    }
  }
  if (cam.target) faceTarget();
  resolveCircle(player.pos, PLAYER_RADIUS, world.obstacles);
  const lim = WORLD_RADIUS + 8;
  if (player.pos.length() > lim) player.pos.setLength(lim);

  // 검 애니메이션
  if (player.charging) {
    const k = player.chargeT / HC.maxCharge;
    sword.rotation.set(-0.9 * k, 1.6, 0);
    playerMesh.rotation.z = Math.sin(performance.now() / 30) * 0.02 * k;
  } else if (player.attackT > 0) {
    player.attackT -= dt;
    const total = player.attackKind === "heavy" ? HC.time : AC.time;
    const k = 1 - Math.max(0, player.attackT) / total;
    sword.rotation.set(player.attackKind === "heavy" ? -0.9 + k * 1.4 : 0, (player.attackKind === "heavy" ? 1.8 : 1.4) - k * (player.attackKind === "heavy" ? 3.6 : 2.8), 0);
    playerMesh.rotation.z = 0;
  } else {
    sword.rotation.x = THREE.MathUtils.lerp(sword.rotation.x, 0, dt * 10);
    sword.rotation.y = THREE.MathUtils.lerp(sword.rotation.y, 0.3, dt * 10);
    playerMesh.rotation.z = 0;
  }
  playerMesh.position.copy(player.pos);
  playerMesh.position.y = moving ? Math.abs(Math.sin(performance.now() / 110)) * 0.06 : 0;
  playerMesh.rotation.y = player.facing;
}

function enemyAttackHits(e: Enemy, dist: number): boolean {
  return !player.dead && dist < e.def.attackRange + 0.5;
}

function updateEnemies(dt: number) {
  for (const e of enemies) {
    const m = e.mesh;
    if (e.state === "dead") {
      e.t += dt;
      m.root.scale.setScalar(Math.max(0.01, 1 - e.t * 3));
      if (e.t > 0.35) m.root.visible = false;
      e.respawnT -= dt;
      if (e.respawnT <= 0) respawn(e);
      continue;
    }
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.flashT = Math.max(0, e.flashT - dt);
    tickPoise(e.poise, dt, { ...PC, max: e.def.poise });
    const to = tmpV.copy(player.pos).sub(e.pos).setY(0);
    const dist = to.length();
    const dirTo = to.clone().normalize();
    e.t += dt;
    let yaw = m.root.rotation.y;

    switch (e.state) {
      case "wander":
        if (Math.random() < dt * 0.4) e.wanderDir = Math.random() * 6.28;
        e.pos.x += Math.sin(e.wanderDir) * e.def.moveSpeed * 0.3 * dt;
        e.pos.z += Math.cos(e.wanderDir) * e.def.moveSpeed * 0.3 * dt;
        if (e.pos.length() > WORLD_RADIUS) e.wanderDir = Math.atan2(-e.pos.x, -e.pos.z);
        if (!player.dead && dist < e.def.aggroRange) e.state = "chase";
        yaw = e.wanderDir;
        break;
      case "chase": {
        if (player.dead || dist > e.def.aggroRange * 1.8) { e.state = "wander"; break; }
        yaw = Math.atan2(dirTo.x, dirTo.z);
        const inRange = dist < e.def.attackRange;
        if (inRange && e.attackCd <= 0) {
          e.state = "windup";
          e.t = 0;
          sfx.telegraph();
          break;
        }
        if (e.def.ai === "ranged") {
          const pref = e.def.preferredRange ?? 7;
          if (dist > pref + 1) e.pos.addScaledVector(dirTo, e.def.moveSpeed * dt);
          else if (dist < pref - 2) e.pos.addScaledVector(dirTo, -e.def.moveSpeed * 0.8 * dt);
        } else if (dist > e.def.attackRange * 0.8 || e.def.ai === "charger") {
          if (dist > 1.2) e.pos.addScaledVector(dirTo, e.def.moveSpeed * dt);
        }
        break;
      }
      case "windup":
        // 공격 예고: 눈이 붉게 빛나며 웅크림 (돌진형은 뒷발질)
        yaw = Math.atan2(dirTo.x, dirTo.z);
        m.body.scale.y = 0.8 - Math.min(1, e.t / e.def.windup) * 0.25;
        if (e.def.ai === "charger") m.root.position.x += Math.sin(e.t * 60) * 0.03;
        if (e.t >= e.def.windup) {
          m.body.scale.y = 1.0;
          e.t = 0;
          e.attackCd = e.def.attackCooldown;
          if (e.def.ai === "melee") {
            if (enemyAttackHits(e, dist)) {
              if (isInvulnerable(player.dodgeT, DC.iframe)) floater(player.pos.clone().setY(2), "회피!", "exp");
              else hurtPlayer(computeDamage({ atk: e.def.atk, def: player.def }).amount);
            }
            e.state = "recover";
          } else if (e.def.ai === "ranged") {
            fireProjectile(e);
            e.state = "recover";
          } else {
            e.chargeDir.copy(dirTo);
            e.hitPlayer = false;
            e.state = "attack";
          }
        }
        break;
      case "attack": // 돌진
        yaw = Math.atan2(e.chargeDir.x, e.chargeDir.z);
        e.pos.addScaledVector(e.chargeDir, (e.def.chargeSpeed ?? 12) * dt);
        if (!e.hitPlayer && !player.dead && dist < e.def.size + 0.6) {
          e.hitPlayer = true;
          if (isInvulnerable(player.dodgeT, DC.iframe)) floater(player.pos.clone().setY(2), "회피!", "exp");
          else {
            hurtPlayer(computeDamage({ atk: e.def.atk, def: player.def }).amount);
            player.pos.addScaledVector(e.chargeDir, 1.5);
          }
        }
        if (e.t % 0.08 < dt) fx.burst(e.pos.clone().setY(0.2), "#6b6157", 2, 1.5);
        if (e.t >= (e.def.chargeTime ?? 0.6) || resolveCircle(e.pos, e.def.size * 0.8, world.obstacles)) {
          e.state = "recover";
          e.t = 0;
          fx.addShake(0.25);
        }
        break;
      case "recover":
        m.body.scale.y = THREE.MathUtils.lerp(m.body.scale.y, 0.8, dt * 8);
        if (e.t > e.def.recover) e.state = "chase";
        break;
      case "stagger":
        m.root.rotation.z = Math.sin(e.t * 12) * 0.15;
        if (!isStaggered(e.poise)) { e.state = "chase"; m.root.rotation.z = 0; }
        break;
    }

    const glow = e.state === "windup" ? "#ff3322" : e.state === "stagger" ? "#ffffff" : e.def.eyeColor;
    m.eyeMat.color.set(glow);
    m.eyeMat.emissive.set(glow);
    m.mat.emissive.set(e.flashT > 0 ? "#ffffff" : e.state === "stagger" ? "#ffcc66" : "#000000");
    m.mat.emissiveIntensity = e.flashT > 0 ? 0.8 : e.state === "stagger" ? 0.25 : 0;
    m.root.rotation.y = yaw;
    m.root.position.set(e.pos.x, e.state === "chase" ? Math.abs(Math.sin(e.t * 10)) * 0.08 : 0, e.pos.z);

    // 머리 위 HP 바 (피해를 입었을 때만)
    const hb = e.hpBar;
    hb.visible = e.hp < e.def.hp;
    if (hb.visible) {
      hb.position.set(e.pos.x, e.def.size * 2 + 0.3, e.pos.z);
      hb.quaternion.copy(camera.quaternion);
      const k = Math.max(0, e.hp / e.def.hp);
      hb.scale.set(Math.max(0.01, k) * e.def.size * 1.6, 1, 1);
    }
  }
  for (const e of enemies) if (e.state !== "dead" && e.state !== "attack") resolveCircle(e.pos, e.def.size * 0.8, world.obstacles);
  // 적끼리 겹침 방지
  for (let i = 0; i < enemies.length; i++)
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (a.state === "dead" || b.state === "dead") continue;
      const d = a.pos.distanceTo(b.pos), min = (a.def.size + b.def.size) * 0.9;
      if (d > 0 && d < min) {
        const push = a.pos.clone().sub(b.pos).multiplyScalar((min - d) / d / 2);
        a.pos.add(push);
        b.pos.sub(push);
      }
    }
}

function hurtPlayer(amount: number) {
  if (player.dead) return;
  player.hp = Math.max(0, player.hp - amount);
  player.hurtT = 0.2;
  player.charging = false;
  floater(player.pos.clone().setY(2), `-${amount}`, "hurt");
  fx.addShake(0.5);
  fx.burst(player.pos.clone().setY(1), "#e2553c", 6, 3);
  sfx.hurt();
  if (player.hp <= 0) {
    player.dead = true;
    cam.target = null;
    toast("쓰러졌다… 봉화에서 다시 일어난다");
    playerMesh.rotation.z = Math.PI / 2;
    setTimeout(() => {
      player.dead = false;
      player.hp = player.maxHp;
      player.pos.set(0, 0, 3);
      playerMesh.rotation.z = 0;
    }, 2500);
  }
}

function updateFloaters(dt: number) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    f.pos.y += dt * 1.2;
    const p = f.pos.clone().project(camera);
    f.el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    f.el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    f.el.style.opacity = String(1 - f.t / 0.9);
    if (f.t > 0.9) {
      f.el.remove();
      floaters.splice(i, 1);
    }
  }
}

// 봉화 근처에서는 천천히 회복
function updateBeacon(dt: number) {
  if (!player.dead && player.pos.length() < 3.5 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.15 * dt);
  }
}

function updateCamera(dt: number) {
  if (keys.has("KeyQ")) { cam.yaw += dt * 2.2; cam.target = null; }
  if (keys.has("KeyE")) { cam.yaw -= dt * 2.2; cam.target = null; }
  if (cam.target) {
    if (cam.target.state === "dead" || cam.target.pos.distanceTo(player.pos) > 22) cam.target = null;
    else {
      const to = cam.target.pos.clone().sub(player.pos);
      const want = Math.atan2(to.x, to.z);
      let diff = want - cam.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      cam.yaw += diff * Math.min(1, dt * 4);
    }
  }
  const f = camForward();
  const want = player.pos.clone().addScaledVector(f, -cam.dist * 0.74).setY(cam.height);
  camera.position.lerp(want, Math.min(1, dt * 6));
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  fx.applyShake(camera);
}

const clock = new THREE.Clock();
function frame() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // 히트스톱: 잠깐 게임 시간을 멈춘다 (카메라·이펙트는 계속)
  let dt = realDt;
  if (fx.hitstop > 0) {
    fx.hitstop -= realDt;
    dt = realDt * 0.05;
  }
  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateLoot(dt);
  updateBeacon(dt);
  world.update(t);
  fx.update(realDt);
  updateCamera(realDt);

  renderer.render(scene, camera);
  updateFloaters(realDt);
  updateHud();
  requestAnimationFrame(frame);
}
// 첫 프레임 카메라 위치
camera.position.copy(player.pos).addScaledVector(camForward(), -cam.dist * 0.74).setY(cam.height);
frame();
if (loaded) toast(`이어하기 — Lv ${player.lv.level}`);

// 테스트·스크린샷용 디버그 핸들 (게임 플레이에 영향 없음)
(window as any).__game = {
  player,
  enemies,
  cam,
  attack: tryAttack,
  dodge: tryDodge,
  startCharge,
  releaseCharge,
  lockOn: toggleLockOn,
  toggleCharPanel,
  toggleInvPanel,
  spawnLoot: (rarity: string, baseId?: string) => spawnLoot(generateItem(Math.random, player.lv.level, { rarity: rarity as any, baseId }), player.pos.clone().add(new THREE.Vector3(1.2, 0, 1.2))),
  spendPoint,
  save: saveGame,
  nearest(filter?: string) {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of enemies) {
      if (e.state === "dead" || (filter && e.id !== filter)) continue;
      const d = e.pos.distanceTo(player.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },
  faceNearest() {
    const best = (window as any).__game.nearest();
    if (!best) return Infinity;
    const to = best.pos.clone().sub(player.pos);
    player.facing = Math.atan2(to.x, to.z);
    return to.length();
  },
};
