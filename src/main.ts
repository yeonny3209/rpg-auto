import * as THREE from "three";
import enemyData from "../data/enemies.json";
import prog from "../data/progression.json";
import combatCfg from "../data/combat.json";
import { makeStamina, spend, regen, isInvulnerable } from "./logic/stamina";
import { resolveCircle } from "./logic/collision";
import { buildWorld, WORLD_RADIUS } from "./game/world";
import { makePlayerMesh, makeEnemyMesh } from "./game/actors";
import { computeDamage, rollRange } from "./logic/combat";
import { expToNext, gainExp, maxHpAt, type LevelState } from "./logic/progression";

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

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

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
  attackT: 0, // 공격 진행 시간(>0이면 휘두르는 중)
  attackCd: 0,
  hurtT: 0,
  dead: false,
  stamina: makeStamina(combatCfg.stamina),
  dodgeT: null as number | null, // 회피 시작 후 경과 시간 (null = 회피 중 아님)
  dodgeDir: new THREE.Vector3(),
  dodgeCd: 0,
};
const PLAYER_RADIUS = 0.4;

// ---------- 적 ----------
type EnemyDef = (typeof enemyData)["ashCrawler"];
interface Enemy {
  def: EnemyDef;
  mesh: ReturnType<typeof makeEnemyMesh>;
  pos: THREE.Vector3;
  hp: number;
  state: "wander" | "chase" | "windup" | "recover" | "dead";
  t: number;
  wanderDir: number;
  attackCd: number;
  flashT: number;
  respawnT: number;
}
const enemies: Enemy[] = [];
const ENEMY_COUNT = 10;

function spawnPoint(): THREE.Vector3 {
  const r = 12 + Math.random() * (WORLD_RADIUS - 14);
  const th = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
}

function spawnEnemy(e?: Enemy) {
  const def = enemyData.ashCrawler;
  if (!e) {
    const mesh = makeEnemyMesh(def.color, def.eyeColor, def.size);
    scene.add(mesh.root);
    e = { def, mesh, pos: spawnPoint(), hp: def.hp, state: "wander", t: 0, wanderDir: Math.random() * 6.28, attackCd: 0, flashT: 0, respawnT: 0 };
    enemies.push(e);
  } else {
    e.pos.copy(spawnPoint());
    e.hp = def.hp;
    e.state = "wander";
    e.mesh.root.visible = true;
    e.mesh.root.scale.setScalar(1);
  }
  e.mesh.root.position.copy(e.pos);
}
for (let i = 0; i < ENEMY_COUNT; i++) spawnEnemy();
// 첫 화면에서 바로 보이도록 몇 마리는 가까이
enemies.slice(0, 3).forEach((e, i) => {
  e.pos.set(-4 + i * 4, 0, 9 + (i % 2) * 2);
  e.mesh.root.position.copy(e.pos);
});

// ---------- 입력 ----------
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyJ") tryAttack();
  if (e.code === "Space") { e.preventDefault(); tryDodge(); }
});
addEventListener("keyup", (e) => keys.delete(e.code));
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 0) tryAttack();
});

const AC = combatCfg.attack, DC = combatCfg.dodge;
const ATTACK_TIME = AC.time, ATTACK_CD = AC.cooldown, ATTACK_RANGE = AC.range, ATTACK_ARC = Math.cos((AC.arcDeg / 2) * (Math.PI / 180));

function moveInput(): THREE.Vector3 {
  return new THREE.Vector3(
    (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0),
    0,
    (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0)
  );
}

function tryDodge() {
  if (player.dead || player.dodgeT !== null || player.dodgeCd > 0) return;
  if (!spend(player.stamina, DC.staminaCost)) return flashStamina();
  const dir = moveInput();
  if (dir.lengthSq() === 0) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
  player.dodgeDir.copy(dir.normalize());
  player.facing = Math.atan2(dir.x, dir.z);
  player.dodgeT = 0;
  player.attackT = 0;
}

function tryAttack() {
  if (player.dead || player.attackCd > 0 || player.dodgeT !== null) return;
  if (!spend(player.stamina, AC.staminaCost)) return flashStamina();
  player.attackT = ATTACK_TIME;
  player.attackCd = ATTACK_CD;
  // 휘두르는 순간 판정
  const fwd = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  for (const e of enemies) {
    if (e.state === "dead") continue;
    const to = e.pos.clone().sub(player.pos);
    const d = to.length();
    if (d > ATTACK_RANGE + e.def.size * 0.6) continue;
    if (d > 0.3 && to.normalize().dot(fwd) < ATTACK_ARC) continue;
    const r = computeDamage({ atk: player.atk, def: e.def.def, critChance: AC.critChance });
    hitEnemy(e, r.amount, r.crit);
  }
}

function hitEnemy(e: Enemy, amount: number, crit: boolean) {
  e.hp -= amount;
  e.flashT = 0.12;
  floater(e.pos.clone().setY(1.6), String(amount), crit ? "crit" : "");
  // 넉백
  const push = e.pos.clone().sub(player.pos).setY(0).normalize().multiplyScalar(0.6);
  e.pos.add(push);
  if (e.state === "wander") e.state = "chase";
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e: Enemy) {
  e.state = "dead";
  e.t = 0;
  e.respawnT = 6;
  const gold = rollRange(e.def.gold as [number, number]);
  player.gold += gold;
  const before = player.lv.level;
  const r = gainExp(player.lv, e.def.exp);
  player.lv = r.state;
  floater(e.pos.clone().setY(2.2), `+${e.def.exp} EXP  ◆${gold}`, "exp");
  if (r.levelsGained > 0) onLevelUp(before);
}

function onLevelUp(_from: number) {
  player.maxHp = maxHpAt(player.lv.level, prog.base.hp);
  player.atk = prog.base.atk + (player.lv.level - 1) * 2;
  player.hp = player.maxHp;
  toast(`레벨 업!  Lv ${player.lv.level}`);
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
const camOffset = new THREE.Vector3(0, 10.5, -11.5);
const tmpV = new THREE.Vector3();

function updatePlayer(dt: number) {
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.dead) return;

  regen(player.stamina, dt, combatCfg.stamina);
  stFlashT = Math.max(0, stFlashT - dt);
  player.dodgeCd = Math.max(0, player.dodgeCd - dt);

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

  // 카메라 기준 이동 (카메라는 +z를 바라보는 고정 방향)
  const dir = moveInput();
  const moving = dir.lengthSq() > 0;
  if (moving) {
    dir.normalize();
    const speed = prog.base.moveSpeed * (player.attackT > 0 ? 0.35 : 1);
    player.pos.addScaledVector(dir, speed * dt);
    const target = Math.atan2(dir.x, dir.z);
    let diff = target - player.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.facing += diff * Math.min(1, dt * 14);
  }
  resolveCircle(player.pos, PLAYER_RADIUS, world.obstacles);
  const lim = WORLD_RADIUS + 8;
  if (player.pos.length() > lim) player.pos.setLength(lim);

  // 검 휘두르기 애니메이션
  if (player.attackT > 0) {
    player.attackT -= dt;
    const k = 1 - Math.max(0, player.attackT) / ATTACK_TIME;
    sword.rotation.y = 1.4 - k * 2.8;
  } else {
    sword.rotation.y = THREE.MathUtils.lerp(sword.rotation.y, 0.3, dt * 10);
  }
  playerMesh.position.copy(player.pos);
  playerMesh.position.y = moving ? Math.abs(Math.sin(performance.now() / 110)) * 0.06 : 0;
  playerMesh.rotation.y = player.facing;
}

function updateEnemies(dt: number) {
  for (const e of enemies) {
    const m = e.mesh;
    if (e.state === "dead") {
      e.t += dt;
      m.root.scale.setScalar(Math.max(0.01, 1 - e.t * 3));
      if (e.t > 0.35) m.root.visible = false;
      e.respawnT -= dt;
      if (e.respawnT <= 0) spawnEnemy(e);
      continue;
    }
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.flashT = Math.max(0, e.flashT - dt);
    const to = tmpV.copy(player.pos).sub(e.pos).setY(0);
    const dist = to.length();
    e.t += dt;

    if (e.state === "wander") {
      if (Math.random() < dt * 0.4) e.wanderDir = Math.random() * 6.28;
      e.pos.x += Math.sin(e.wanderDir) * e.def.moveSpeed * 0.3 * dt;
      e.pos.z += Math.cos(e.wanderDir) * e.def.moveSpeed * 0.3 * dt;
      if (!player.dead && dist < e.def.aggroRange) e.state = "chase";
      m.root.rotation.y = e.wanderDir;
    } else if (e.state === "chase") {
      if (player.dead || dist > e.def.aggroRange * 1.8) e.state = "wander";
      else if (dist < e.def.attackRange && e.attackCd <= 0) {
        e.state = "windup";
        e.t = 0;
      } else if (dist > e.def.attackRange * 0.8) {
        to.normalize();
        e.pos.addScaledVector(to, e.def.moveSpeed * dt);
      }
      m.root.rotation.y = Math.atan2(to.x, to.z);
    } else if (e.state === "windup") {
      // 공격 예고: 0.55초 동안 눈이 붉게 빛나며 웅크림
      m.body.scale.y = 0.8 - Math.min(1, e.t / 0.55) * 0.25;
      if (e.t >= 0.55) {
        m.body.scale.y = 1.0;
        const inv = isInvulnerable(player.dodgeT, DC.iframe);
        if (inv && dist < e.def.attackRange + 0.5) floater(player.pos.clone().setY(2), "회피!", "exp");
        else if (!player.dead && dist < e.def.attackRange + 0.5) {
          const r = computeDamage({ atk: e.def.atk, def: player.def });
          hurtPlayer(r.amount);
        }
        e.state = "recover";
        e.t = 0;
        e.attackCd = e.def.attackCooldown;
      }
    } else if (e.state === "recover") {
      m.body.scale.y = THREE.MathUtils.lerp(m.body.scale.y, 0.8, dt * 8);
      if (e.t > 0.5) e.state = "chase";
    }

    const glow = e.state === "windup" ? "#ff3322" : e.def.eyeColor;
    m.eyeMat.color.set(glow);
    m.eyeMat.emissive.set(glow);
    m.mat.emissive.set(e.flashT > 0 ? "#ffffff" : "#000000");
    m.mat.emissiveIntensity = e.flashT > 0 ? 0.8 : 0;
    m.root.position.set(e.pos.x, e.state === "chase" ? Math.abs(Math.sin(e.t * 10)) * 0.08 : 0, e.pos.z);
  }
  for (const e of enemies) if (e.state !== "dead") resolveCircle(e.pos, e.def.size * 0.8, world.obstacles);
  // 적끼리 겹침 방지
  for (let i = 0; i < enemies.length; i++)
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (a.state === "dead" || b.state === "dead") continue;
      const d = a.pos.distanceTo(b.pos), min = a.def.size + b.def.size;
      if (d > 0 && d < min) {
        const push = a.pos.clone().sub(b.pos).multiplyScalar((min - d) / d / 2);
        a.pos.add(push);
        b.pos.sub(push);
      }
    }
}

function hurtPlayer(amount: number) {
  player.hp = Math.max(0, player.hp - amount);
  player.hurtT = 0.2;
  floater(player.pos.clone().setY(2), `-${amount}`, "hurt");
  if (player.hp <= 0) {
    player.dead = true;
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

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  updatePlayer(dt);
  updateEnemies(dt);
  updateBeacon(dt);
  world.update(t);

  const camTarget = player.pos.clone().add(camOffset);
  camera.position.lerp(camTarget, Math.min(1, dt * 6));
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  if (player.hurtT > 0) camera.position.x += (Math.random() - 0.5) * 0.15;

  renderer.render(scene, camera);
  updateFloaters(dt);
  updateHud();
  requestAnimationFrame(frame);
}
// 첫 프레임 카메라 위치
camera.position.copy(player.pos).add(camOffset);
frame();

// 테스트·스크린샷용 디버그 핸들 (게임 플레이에 영향 없음)
(window as any).__game = {
  player,
  enemies,
  attack: tryAttack,
  dodge: tryDodge,
  faceNearest() {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of enemies) {
      if (e.state === "dead") continue;
      const d = e.pos.distanceTo(player.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      const to = best.pos.clone().sub(player.pos);
      player.facing = Math.atan2(to.x, to.z);
    }
    return bd;
  },
};
