import * as THREE from "three";
import prog from "../../data/progression.json";
import combatCfg from "../../data/combat.json";
import { WORLD_RADIUS } from "./world";
import { onDeath } from "../logic/embers";
import { sfx } from "./sfx";
import { computeDamage, rollRange } from "../logic/combat";
import { gainExp } from "../logic/progression";
import { rollDrop } from "../logic/items";
import { spend, regen } from "../logic/stamina";
import { resolveCircle } from "../logic/collision";
import { hitPoise, isStaggered, heavyMultipliers } from "../logic/poise";
import { $, AC, DC, HC, PC, PLAYER_RADIUS, applyDerived, beacons, cam, camForward, camera, flashStamina, floater, fx, keys, player, playerMesh, saveGame, sword, toast, ui, world } from "./core";
import { enemies, type Enemy } from "./enemies";
import { syncTrace } from "./sanctuary";
import { spawnLoot } from "./loot";
import { renderCharPanel } from "./panels";

export function moveInput(): THREE.Vector3 {
  const f = camForward();
  const r = new THREE.Vector3(-f.z, 0, f.x); // 화면 오른쪽
  const v = new THREE.Vector3();
  if (keys.has("KeyW")) v.add(f);
  if (keys.has("KeyS")) v.sub(f);
  if (keys.has("KeyD")) v.add(r);
  if (keys.has("KeyA")) v.sub(r);
  return v;
}

export function faceTarget() {
  if (cam.target && cam.target.state !== "dead") {
    const to = cam.target.pos.clone().sub(player.pos);
    player.facing = Math.atan2(to.x, to.z);
  }
}

export function tryDodge() {
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

export function tryAttack() {
  if (player.dead || player.attackCd > 0 || player.dodgeT !== null || player.charging) return;
  if (!spend(player.stamina, AC.staminaCost)) return flashStamina();
  faceTarget();
  player.attackKind = "light";
  player.attackT = AC.time;
  player.attackCd = AC.cooldown;
  sfx.swing();
  strike(AC.range, AC.arcDeg, 1, AC.poiseDamage, AC.hitstop, false);
}

export function startCharge() {
  if (player.dead || player.attackCd > 0 || player.dodgeT !== null || player.charging) return;
  if (player.stamina.value <= 0) return flashStamina();
  player.charging = true;
  player.chargeT = 0;
  sfx.charge();
}

export function releaseCharge() {
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

export function strike(range: number, arcDeg: number, mul: number, poiseDmg: number, hitstop: number, heavy: boolean) {
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

export function hitEnemy(e: Enemy, amount: number, crit: boolean, heavy: boolean, broke: boolean) {
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

export function killEnemy(e: Enemy) {
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
  player.embers = { ...player.embers, held: player.embers.held + e.def.embers };
  floater(e.pos.clone().setY(2.2), `+${e.def.exp} EXP  ◆${gold}  ✦${e.def.embers}`, "exp");
  if (r.levelsGained > 0) onLevelUp();
  const drop = rollDrop(Math.random, e.def.level, e.def.dropChance);
  if (drop) spawnLoot(drop, e.pos);
}

export function onLevelUp() {
  applyDerived(true);
  toast(`레벨 업!  Lv ${player.lv.level}  —  C: 능력치 배분`);
  saveGame();
  renderCharPanel();
  fx.burst(player.pos.clone().setY(1), "#ffcc66", 30, 6);
  sfx.levelUp();
}

export function toggleLockOn() {
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

export function updatePlayer(dt: number) {
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.dead) return;
  regen(player.stamina, player.charging ? 0 : dt, combatCfg.stamina);
  ui.stFlash = Math.max(0, ui.stFlash - dt);
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

export function hurtPlayer(amount: number) {
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
    const r = onDeath(player.embers, player.pos);
    player.embers = r.state;
    player.trace = r.trace;
    syncTrace();
    toast(r.trace ? `쓰러졌다… 잔불 ${r.trace.amount}개가 흩어졌다` : "쓰러졌다… 봉화에서 다시 일어난다");
    playerMesh.rotation.z = Math.PI / 2;
    saveGame();
    setTimeout(() => {
      player.dead = false;
      player.hp = player.maxHp;
      const b = beacons.find((x) => x.def.id === player.respawnBeacon && x.lit) ?? beacons[0];
      player.pos.copy(b.pos).add(new THREE.Vector3(0, 0, 3));
      camera.position.copy(player.pos).addScaledVector(camForward(), -cam.dist * 0.74).setY(cam.height);
      playerMesh.rotation.z = 0;
    }, 2500);
  }
}
