import * as THREE from "three";
import { heightAt } from "../logic/terrain";
import enemyData from "../../data/enemies.json";
import { REGIONS, regionAt, regionById, pointInRegion, walkable, clampWalkable, weightsFor } from "../logic/regions";
import { makeEnemyMesh } from "./actors";
import { sfx } from "./sfx";
import { computeDamage } from "../logic/combat";
import { isInvulnerable } from "../logic/stamina";
import { resolveCircle } from "../logic/collision";
import { makePoise, tickPoise, isStaggered, type Poise } from "../logic/poise";
import { weightedPick } from "../logic/spawn";
import { playerInvulnerable, DC, PC, camera, floater, fx, player, scene, world } from "./core";
import { hurtPlayer, killEnemy } from "./player";
import { coop, rng32 } from "./coop";
import { BOSS_IDS, bossCfg, phaseOf, patternParams, nextPattern, cooldownFor, fanAngles, inSlam, type PatternId, type Phase, type BossId } from "../logic/boss";

// ---------- 적 ----------
export type EnemyId = keyof typeof enemyData;
export type EnemyDef = (typeof enemyData)[EnemyId] & Partial<{ preferredRange: number; projectileSpeed: number; chargeSpeed: number; chargeTime: number }>;
export type EState = "wander" | "chase" | "windup" | "attack" | "recover" | "stagger" | "dead";
export interface Enemy {
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
  home: THREE.Vector3; // 태어난 곳(재생성 지역 판정용)
  // --- 함께 사냥: idx는 모든 접속자가 같은 번호(시드 배치), owner가 AI를 돌리고 나머지는 mirror로 따라간다
  idx: number;
  owner: string | null;
  mirror: { tx: number; tz: number; hp: number; st: EState; ry: number } | null;
  contrib: Set<string>;
  kills: number;
  claimSent: boolean;
  boss?: BossRt;
}
export interface BossRt { pattern: PatternId | null; prev: PatternId | null; combo: number; phase: Phase; home: THREE.Vector3; ring: THREE.Mesh; locked: boolean }
export const enemies: Enemy[] = [];
export const ENEMY_COUNT = 14;
export const weightsOf = (region: string) => weightsFor(region, enemyData as any) as Record<EnemyId, number>;

export function spawnPoint(region = "ashenPlains", rng: () => number = Math.random): THREE.Vector3 {
  const pt = pointInRegion(regionById(region), rng, 12, 4);
  return new THREE.Vector3(pt.x, 0, pt.z);
}

export const hpBarGeo = new THREE.PlaneGeometry(1, 0.09);
hpBarGeo.translate(0.5, 0, 0); // 왼쪽 끝 기준으로 줄어들도록
export function createEnemy(id: EnemyId, pos: THREE.Vector3): Enemy {
  const def = enemyData[id] as EnemyDef;
  const mesh = makeEnemyMesh(def.color, def.eyeColor, def.size, def.ai === "boss" ? "charger" : def.ai);
  const hpBar = new THREE.Mesh(hpBarGeo, new THREE.MeshBasicMaterial({ color: "#e2553c", depthTest: false, transparent: true }));
  hpBar.renderOrder = 10;
  hpBar.visible = false;
  scene.add(mesh.root, hpBar);
  const e: Enemy = {
    id, def, mesh, pos: pos.clone(), hp: def.hp, poise: makePoise({ ...PC, max: def.poise }), state: "wander", t: 0,
    wanderDir: Math.random() * 6.28, attackCd: 0, flashT: 0, respawnT: 0, chargeDir: new THREE.Vector3(), hitPlayer: false, hpBar, home: pos.clone(),
    idx: enemies.length, owner: null, mirror: null, contrib: new Set(), kills: 0, claimSent: false,
  };
  if (def.ai === "boss") {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 56), new THREE.MeshBasicMaterial({ color: "#ff3a1a", transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    e.boss = { pattern: null, prev: null, combo: 0, phase: 1, home: pos.clone(), ring, locked: false };
  }
  mesh.root.position.copy(e.pos);
  enemies.push(e);
  return e;
}
export function respawn(e: Enemy) {
  if (e.boss) { e.contrib.clear(); e.owner = null; e.mirror = null; e.claimSent = false; resetBoss(e); e.mesh.root.visible = true; e.mesh.root.scale.setScalar(1); return; }
  e.pos.copy(spawnPoint(regionAt(e.home.x, e.home.z).id, rng32(e.idx * 131 + e.kills * 7 + 1))); // 같은 번호·같은 횟수면 모두 같은 자리
  e.contrib.clear(); e.owner = null; e.mirror = null; e.claimSent = false;
  e.hp = e.def.hp;
  e.poise = makePoise({ ...PC, max: e.def.poise });
  e.state = "wander";
  e.mesh.root.visible = true;
  e.mesh.root.scale.setScalar(1);
}
{ const r = rng32(20241128); for (const rg of REGIONS) for (let i = 0; i < rg.count; i++) createEnemy(weightedPick(weightsOf(rg.id), r()), spawnPoint(rg.id, r)); } // 시드 배치: 접속자 모두 같은 적/같은 번호
// 지역 보스: 정해진 자리에서 기다린다
for (const id of BOSS_IDS) { const h = bossCfg(id).home; createEnemy(id, new THREE.Vector3(h.x, 0, h.z)); }
// 첫 전투가 쉽도록 마을에서 조금 떨어진 곳(약 14m)에 약한 적 둘
createEnemy("ashCrawler", new THREE.Vector3(10, 0, 11));
createEnemy("ashCrawler", new THREE.Vector3(-9, 0, 12));
// 테스트·스크린샷용(?demo): 세 종류를 시작 지점 가까이 배치. 일반 플레이에서는 마을 주변이 조용하다.
if (new URLSearchParams(location.search).has("demo")) {
  createEnemy("ashCrawler", new THREE.Vector3(-3, 0, 9));
  createEnemy("ashCrawler", new THREE.Vector3(1, 0, 10));
  createEnemy("ashSpitter", new THREE.Vector3(5, 0, 14));
  createEnemy("ashCharger", new THREE.Vector3(-6, 0, 15));
}

// ---------- 투사체 ----------
export interface Projectile { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; dmg: number }
export const projectiles: Projectile[] = [];
export const projGeo = new THREE.SphereGeometry(0.22, 10, 8);
export const projMat = new THREE.MeshStandardMaterial({ color: "#9cff6c", emissive: "#6cff3c", emissiveIntensity: 2 });
export function fireProjectile(e: Enemy, at?: THREE.Vector3, dmgOverride?: number) {
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(e.pos).setY(e.pos.y + 1.0);
  const target = (at ?? player.pos).clone().setY((at ?? player.pos).y + 1.0);
  const vel = target.sub(mesh.position).normalize().multiplyScalar(e.def.projectileSpeed ?? 8);
  scene.add(mesh);
  projectiles.push({ mesh, vel, life: 2.5, dmg: dmgOverride ?? computeDamage({ atk: e.def.atk, def: player.def }).amount });
  sfx.spit();
}
export function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    let gone = p.life <= 0;
    const dx = p.mesh.position.x - player.pos.x, dz = p.mesh.position.z - player.pos.z;
    if (!gone && p.dmg > 0 && !player.dead && dx * dx + dz * dz < 0.55 * 0.55) { // dmg 0 = 다른 접속자를 겨눈 연출용 탄
      if (playerInvulnerable()) floater(player.pos.clone().setY(player.pos.y + (2)), "회피!", "exp");
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

export const tmpV = new THREE.Vector3();

// ---------- 보스 ----------
function resetBoss(e: Enemy) {
  const b = e.boss!;
  e.pos.copy(b.home);
  e.hp = e.def.hp;
  e.poise = makePoise({ ...PC, max: e.def.poise });
  e.state = "wander";
  e.attackCd = 1;
  b.pattern = null; b.prev = null; b.combo = 0; b.phase = 1; b.locked = false;
  b.ring.visible = false;
}
export function bossOf(): Enemy | null { return enemies.find((x) => x.boss) ?? null; }

function fireBossShot(e: Enemy, angle: number, mul: number) {
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(e.pos).setY(e.pos.y + 1.4);
  const dir = new THREE.Vector3(Math.sin(e.mesh.root.rotation.y + angle), 0, Math.cos(e.mesh.root.rotation.y + angle));
  scene.add(mesh);
  projectiles.push({ mesh, vel: dir.multiplyScalar(e.def.projectileSpeed ?? 10), life: 2.2, dmg: computeDamage({ atk: e.def.atk * mul, def: player.def }).amount });
}
function bossHit(e: Enemy, mul: number) {
  if (playerInvulnerable()) floater(player.pos.clone().setY(player.pos.y + 2), "회피!", "exp");
  else hurtPlayer(computeDamage({ atk: e.def.atk * mul, def: player.def }).amount);
}

/** 보스 상태 기계. 새 yaw를 반환한다. */
function updateBossState(e: Enemy, dt: number, dist: number, dirTo: THREE.Vector3, yawIn: number): number {
  const b = e.boss!, id = e.id as BossId, cfg = bossCfg(id);
  let yaw = yawIn;
  const ph = phaseOf(e.hp, e.def.hp, id);
  if (ph !== b.phase && e.state !== "dead") {
    b.phase = ph;
    floater(e.pos.clone().setY(e.pos.y + 4.2), "분노!", "crit");
    fx.burst(e.pos.clone().setY(e.pos.y + 1.5), "#ff5a2a", 40, 8);
    fx.addShake(0.8);
    sfx.stagger();
    e.attackCd = 0.5;
  }
  const home = b.home, toHome = Math.hypot(home.x - e.pos.x, home.z - e.pos.z);
  switch (e.state) {
    case "wander": { // 자리에서 대기. 홈에서 멀면 돌아간다
      b.ring.visible = false;
      if (toHome > 0.8) {
        const d = new THREE.Vector3(home.x - e.pos.x, 0, home.z - e.pos.z).normalize();
        e.pos.addScaledVector(d, e.def.moveSpeed * 1.5 * dt);
        yaw = Math.atan2(d.x, d.z);
      } else e.hp = Math.min(e.def.hp, e.hp + e.def.hp * 0.1 * dt);
      if (!player.dead && dist < e.def.aggroRange && Math.hypot(player.pos.x - home.x, player.pos.z - home.z) < cfg.leash) { e.state = "chase"; e.t = 0; }
      break;
    }
    case "chase": {
      yaw = Math.atan2(dirTo.x, dirTo.z);
      if (player.dead || toHome > cfg.leash || dist > e.def.aggroRange * 2) { e.state = "wander"; break; }
      if (dist > 5.5) e.pos.addScaledVector(dirTo, e.def.moveSpeed * dt);
      if (e.attackCd <= 0) {
        const p = nextPattern(id, b.prev, dist, Math.random());
        const params = patternParams(id, p, b.phase);
        b.pattern = p; b.prev = p; b.combo = p === "charge" ? params.count ?? 1 : 1; b.locked = false;
        e.state = "windup"; e.t = 0;
        sfx.telegraph();
      }
      break;
    }
    case "windup": {
      const p = b.pattern!, params = patternParams(id, p, b.phase);
      const need = b.combo > 0 && p === "charge" && e.t < 0 ? 0 : params.windup;
      m_squat(e, Math.min(1, e.t / need));
      if (!b.locked) yaw = Math.atan2(dirTo.x, dirTo.z);
      if (p === "slam") {
        const k = Math.min(1, e.t / need);
        b.ring.visible = true;
        b.ring.position.set(e.pos.x, e.pos.y + 0.08, e.pos.z);
        b.ring.scale.setScalar(Math.max(0.1, params.radius! * k));
        (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * k;
      }
      if (e.t >= need * 0.75) b.locked = true; // 마지막 순간엔 방향 고정 → 옆으로 피하면 맞지 않는다
      if (e.t >= need) {
        e.mesh.body.scale.y = 1;
        if (p === "slam") {
          b.ring.visible = false;
          fx.burst(e.pos.clone().setY(e.pos.y + 0.3), "#ff7a3a", 50, params.radius! * 1.6);
          fx.addShake(0.9);
          sfx.heavyHit();
          if (inSlam(dist, params.radius!)) bossHit(e, params.mul);
          e.attackCd = cooldownFor(id, b.phase);
          e.state = "recover"; e.t = 0;
        } else if (p === "spit") {
          for (const a of fanAngles(params.count!, params.spread!)) fireBossShot(e, a, params.mul);
          sfx.spit();
          e.attackCd = cooldownFor(id, b.phase);
          e.state = "recover"; e.t = 0;
        } else {
          e.chargeDir.set(Math.sin(yaw), 0, Math.cos(yaw));
          e.hitPlayer = false;
          e.state = "attack"; e.t = 0;
        }
      }
      break;
    }
    case "attack": { // 돌진
      const params = patternParams(id, "charge", b.phase);
      yaw = Math.atan2(e.chargeDir.x, e.chargeDir.z);
      e.pos.addScaledVector(e.chargeDir, (e.def.chargeSpeed ?? 16) * dt);
      if (!e.hitPlayer && !player.dead && dist < e.def.size + 0.8) {
        e.hitPlayer = true;
        if (playerInvulnerable()) floater(player.pos.clone().setY(player.pos.y + 2), "회피!", "exp");
        else { bossHit(e, params.mul); player.pos.addScaledVector(e.chargeDir, 2); }
      }
      if (e.t % 0.06 < dt) fx.burst(e.pos.clone().setY(e.pos.y + 0.3), "#6b6157", 3, 2);
      const hitWall = resolveCircle(e.pos, e.def.size * 0.8, world.obstacles);
      if (e.t >= (e.def.chargeTime ?? 0.7) || hitWall) {
        fx.addShake(hitWall ? 0.7 : 0.3);
        b.combo--;
        if (b.combo > 0) { e.state = "windup"; e.t = params.windup - 0.4; b.locked = false; } // 연속 돌진: 짧은 재조준
        else { e.attackCd = cooldownFor(id, b.phase); e.state = "recover"; e.t = 0; }
      }
      break;
    }
    case "recover":
      e.mesh.body.scale.y = THREE.MathUtils.lerp(e.mesh.body.scale.y, 0.85, dt * 8);
      if (e.t > e.def.recover) { e.state = "chase"; e.mesh.body.scale.y = 1; }
      break;
    case "stagger":
      b.ring.visible = false; b.locked = false;
      e.mesh.root.rotation.z = Math.sin(e.t * 12) * 0.1;
      if (!isStaggered(e.poise)) { e.state = "chase"; e.mesh.root.rotation.z = 0; e.attackCd = Math.max(e.attackCd, 0.6); }
      break;
  }
  return yaw;
}
function m_squat(e: Enemy, k: number) { e.mesh.body.scale.y = 0.85 - k * 0.2; }


export function enemyAttackHits(e: Enemy, dist: number): boolean {
  return !player.dead && dist < e.def.attackRange + 0.5;
}

// ---------- 함께 사냥 ----------
const tmpO = new THREE.Vector3();
function claim(e: Enemy) {
  if (!coop.connected || e.owner !== null || e.claimSent) return;
  e.claimSent = true;
  coop.send({ t: "claim", i: e.idx });
}
/** 담당자가 AI를 돌릴 때의 목표: 가장 가까운 접속자(나 포함). tname이 null이면 나. */
function pickTarget(e: Enemy): { pos: THREE.Vector3; tname: string | null } {
  if (e.boss || !coop.connected || e.owner !== coop.me) return { pos: player.pos, tname: null };
  let best = { pos: player.pos, tname: null as string | null }, bd = player.dead ? Infinity : player.pos.distanceTo(e.pos) - 2; // 나에게 약간 유리(2m)
  for (const o of coop.others()) {
    const d = Math.hypot(o.x - e.pos.x, o.z - e.pos.z);
    if (d < bd) { bd = d; best = { pos: tmpO.set(o.x, e.pos.y, o.z), tname: o.name }; }
  }
  return best;
}
function hurtTarget(e: Enemy, tname: string | null, amount: number, knock?: THREE.Vector3) {
  if (tname !== null) { coop.send({ t: "phit", to: tname, amount, enemy: e.id }); return; }
  if (playerInvulnerable()) floater(player.pos.clone().setY(player.pos.y + 2), "회피!", "exp");
  else { hurtPlayer(amount); if (knock) player.pos.addScaledVector(knock, 1.5); }
}
/** 다른 접속자가 담당하는 적에게 들어온 공격(서버가 전달)을 담당자(나)가 처리 */
export function applyRemoteHit(e: Enemy, amount: number, broke: boolean, by: string) {
  if (e.state === "dead") return;
  e.hp -= amount; e.flashT = 0.12; e.contrib.add(by);
  fx.burst(e.pos.clone().setY(e.pos.y + 0.8), "#ffb347", 5, 3.5);
  if (broke) { e.state = "stagger"; e.t = 0; } else if (e.state === "wander") e.state = "chase";
  if (e.hp <= 0) killEnemy(e);
}
/** 서버의 처치 알림. by에 내가 있으면 보상을 받는다. */
export function applyKill(i: number, by: string[]) {
  const e = enemies[i];
  if (!e || e.state === "dead") return;
  e.hp = 0; e.mirror = null; e.owner = null;
  killEnemy(e, { reward: by.includes(coop.me), silent: true });
}
export function setOwner(i: number, by: string | null) {
  const e = enemies[i]; if (!e) return;
  e.owner = by; e.claimSent = false;
  e.mirror = by && by !== coop.me ? { tx: e.pos.x, tz: e.pos.z, hp: e.hp, st: e.state === "dead" ? "wander" : e.state, ry: e.mesh.root.rotation.y } : null;
}
export function applyStream(list: [number, number, number, number, string, number][]) {
  for (const [i, x, z, hp, st, ry] of list) {
    const e = enemies[i]; if (!e || !e.mirror || e.state === "dead") continue;
    Object.assign(e.mirror, { tx: x, tz: z, hp, st: st as EState, ry });
  }
}
/** 담당 중인 적의 상태(스트림용) */
export function ownedStates(): [number, number, number, number, string, number][] {
  return enemies.filter((e) => e.owner === coop.me && e.state !== "dead").map((e) => [e.idx, +e.pos.x.toFixed(2), +e.pos.z.toFixed(2), Math.round(e.hp), e.state, +e.mesh.root.rotation.y.toFixed(2)]);
}
export function releaseAll() { for (const e of enemies) { e.owner = null; e.mirror = null; e.claimSent = false; } }

export function updateEnemies(dt: number) {
  for (const e of enemies) {
    const m = e.mesh;
    e.pos.y = heightAt(e.pos.x, e.pos.z);
    if (e.state === "dead") {
      if (e.boss) e.boss.ring.visible = false;
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
    const mirrored = coop.connected && e.owner !== null && e.owner !== coop.me; // 다른 사람이 담당 → AI를 돌리지 않고 따라간다
    const tgt = pickTarget(e), tname = tgt.tname, tDead = tname === null && player.dead;
    const to = tmpV.copy(tgt.pos).sub(e.pos).setY(0);
    const dist = to.length();
    const dirTo = to.clone().normalize();
    e.t += dt;
    let yaw = m.root.rotation.y;

    if (mirrored) {
      const mr = e.mirror;
      if (mr) {
        const k = Math.min(1, dt * 10);
        e.pos.x += (mr.tx - e.pos.x) * k; e.pos.z += (mr.tz - e.pos.z) * k;
        e.hp = mr.hp; e.state = mr.st;
        let d = mr.ry - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * k;
        if (e.state === "windup") m.body.scale.y = 0.8 - Math.min(1, e.t / e.def.windup) * 0.25; else m.body.scale.y = THREE.MathUtils.lerp(m.body.scale.y, 1, dt * 8);
      }
    } else if (e.boss) yaw = updateBossState(e, dt, dist, dirTo, yaw);
    else switch (e.state) {
      case "wander":
        if (Math.random() < dt * 0.4) e.wanderDir = Math.random() * 6.28;
        e.pos.x += Math.sin(e.wanderDir) * e.def.moveSpeed * 0.3 * dt;
        e.pos.z += Math.cos(e.wanderDir) * e.def.moveSpeed * 0.3 * dt;
        if (!walkable(e.pos.x, e.pos.z)) { const rg = regionAt(e.pos.x, e.pos.z); e.wanderDir = Math.atan2(rg.x - e.pos.x, rg.z - e.pos.z); }
        if (!tDead && dist < e.def.aggroRange) e.state = "chase";
        yaw = e.wanderDir;
        break;
      case "chase": {
        if (tDead || dist > e.def.aggroRange * 1.8) { e.state = "wander"; break; }
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
            if (!tDead && dist < e.def.attackRange + 0.5) hurtTarget(e, tname, computeDamage({ atk: e.def.atk, def: player.def }).amount);
            e.state = "recover";
          } else if (e.def.ai === "ranged") {
            if (tname !== null) { // 다른 접속자를 겨냥: 탄은 연출만, 도착 시각에 맞춰 맞은 쪽에서 회피 판정
              const amt = computeDamage({ atk: e.def.atk, def: player.def }).amount;
              fireProjectile(e, tgt.pos, 0);
              window.setTimeout(() => { if (coop.connected && e.state !== "dead") coop.send({ t: "phit", to: tname, amount: amt, enemy: e.id }); }, (dist / (e.def.projectileSpeed ?? 8)) * 1000);
            } else fireProjectile(e);
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
        if (!e.hitPlayer && !tDead && dist < e.def.size + 0.6) {
          e.hitPlayer = true;
          hurtTarget(e, tname, computeDamage({ atk: e.def.atk, def: player.def }).amount, e.chargeDir);
        }
        if (e.t % 0.08 < dt) fx.burst(e.pos.clone().setY(e.pos.y + (0.2)), "#6b6157", 2, 1.5);
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

    if (coop.connected && !mirrored) {
      if (e.owner === null && e.state !== "wander") claim(e);
      else if (e.owner === coop.me && e.state === "wander" && !e.boss?.locked) { coop.send({ t: "free", i: e.idx }); e.owner = null; e.claimSent = false; } // 추적을 끝냄 → 담당 해제
    }

    const glow = e.state === "windup" ? "#ff3322" : e.state === "stagger" ? "#ffffff" : e.def.eyeColor;
    m.eyeMat.color.set(glow);
    m.eyeMat.emissive.set(glow);
    m.mat.emissive.set(e.flashT > 0 ? "#ffffff" : e.state === "stagger" ? "#ffcc66" : "#000000");
    m.mat.emissiveIntensity = e.flashT > 0 ? 0.8 : e.state === "stagger" ? 0.25 : 0;
    m.root.rotation.y = yaw;
    m.root.position.set(e.pos.x, e.pos.y + (e.state === "chase" ? Math.abs(Math.sin(e.t * 10)) * 0.08 : 0), e.pos.z);

    // 머리 위 HP 바 (피해를 입었을 때만)
    const hb = e.hpBar;
    hb.visible = e.hp < e.def.hp && !e.boss;
    if (hb.visible) {
      const full = e.def.size * 1.6;
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      hb.position.set(e.pos.x, e.pos.y + e.def.size * 2 + 0.3, e.pos.z).addScaledVector(camRight, -full / 2);
      hb.quaternion.copy(camera.quaternion);
      const k = Math.max(0, e.hp / e.def.hp);
      hb.scale.set(Math.max(0.01, k) * full, 1, 1);
    }
  }
  for (const e of enemies) if (e.state !== "dead" && e.state !== "attack") resolveCircle(e.pos, e.def.size * 0.8, world.obstacles);
  for (const e of enemies) if (!e.boss && !walkable(e.pos.x, e.pos.z)) { const c = clampWalkable(e.pos.x, e.pos.z); e.pos.x = c.x; e.pos.z = c.z; }
  // 적끼리 겹침 방지
  for (let i = 0; i < enemies.length; i++)
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (a.state === "dead" || b.state === "dead") continue;
      const d = a.pos.distanceTo(b.pos), min = (a.def.size + b.def.size) * 0.9;
      if (d > 0 && d < min) {
        const push = a.pos.clone().sub(b.pos).multiplyScalar((min - d) / d / 2);
        if (!a.boss) a.pos.add(push);
        if (!b.boss) b.pos.sub(push);
      }
    }
}
