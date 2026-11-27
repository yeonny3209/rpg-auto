import * as THREE from "three";
import enemyData from "../../data/enemies.json";
import { WORLD_RADIUS } from "./world";
import { makeEnemyMesh } from "./actors";
import { sfx } from "./sfx";
import { computeDamage } from "../logic/combat";
import { isInvulnerable } from "../logic/stamina";
import { resolveCircle } from "../logic/collision";
import { makePoise, tickPoise, isStaggered, type Poise } from "../logic/poise";
import { weightedPick } from "../logic/spawn";
import { playerInvulnerable, DC, PC, camera, floater, fx, player, scene, world } from "./core";
import { hurtPlayer } from "./player";

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
}
export const enemies: Enemy[] = [];
export const ENEMY_COUNT = 14;
export const weights = Object.fromEntries(Object.entries(enemyData).map(([k, v]) => [k, v.spawnWeight])) as Record<EnemyId, number>;

export function spawnPoint(): THREE.Vector3 {
  const r = 12 + Math.random() * (WORLD_RADIUS - 14);
  const th = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r);
}

export const hpBarGeo = new THREE.PlaneGeometry(1, 0.09);
hpBarGeo.translate(0.5, 0, 0); // 왼쪽 끝 기준으로 줄어들도록
export function createEnemy(id: EnemyId, pos: THREE.Vector3): Enemy {
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
export function respawn(e: Enemy) {
  e.pos.copy(spawnPoint());
  e.hp = e.def.hp;
  e.poise = makePoise({ ...PC, max: e.def.poise });
  e.state = "wander";
  e.mesh.root.visible = true;
  e.mesh.root.scale.setScalar(1);
}
for (let i = 0; i < ENEMY_COUNT; i++) createEnemy(weightedPick(weights, Math.random()), spawnPoint());
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
export function fireProjectile(e: Enemy) {
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(e.pos).setY(1.0);
  const target = player.pos.clone().setY(1.0);
  const vel = target.sub(mesh.position).normalize().multiplyScalar(e.def.projectileSpeed ?? 8);
  scene.add(mesh);
  projectiles.push({ mesh, vel, life: 2.5, dmg: computeDamage({ atk: e.def.atk, def: player.def }).amount });
  sfx.spit();
}
export function updateProjectiles(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    let gone = p.life <= 0;
    const dx = p.mesh.position.x - player.pos.x, dz = p.mesh.position.z - player.pos.z;
    if (!gone && !player.dead && dx * dx + dz * dz < 0.55 * 0.55) {
      if (playerInvulnerable()) floater(player.pos.clone().setY(2), "회피!", "exp");
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

export function enemyAttackHits(e: Enemy, dist: number): boolean {
  return !player.dead && dist < e.def.attackRange + 0.5;
}

export function updateEnemies(dt: number) {
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
              if (playerInvulnerable()) floater(player.pos.clone().setY(2), "회피!", "exp");
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
          if (playerInvulnerable()) floater(player.pos.clone().setY(2), "회피!", "exp");
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
      const full = e.def.size * 1.6;
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      hb.position.set(e.pos.x, e.def.size * 2 + 0.3, e.pos.z).addScaledVector(camRight, -full / 2);
      hb.quaternion.copy(camera.quaternion);
      const k = Math.max(0, e.hp / e.def.hp);
      hb.scale.set(Math.max(0.01, k) * full, 1, 1);
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
