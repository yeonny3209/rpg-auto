import * as THREE from "three";
import { heightAt } from "../logic/terrain";
import prog from "../../data/progression.json";
import combatCfg from "../../data/combat.json";
import { WORLD_RADIUS } from "./world";
import { onDeath } from "../logic/embers";
import { sfx } from "./sfx";
import { scaledList } from "../logic/skillLevel";
import { usePotion, rollMatDrops, bagAdd, MATS } from "../logic/bag";
import { computeDamage, rollRange } from "../logic/combat";
import { gainExp } from "../logic/progression";
import { rollDrop, generateItem, type RarityId } from "../logic/items";
import { spend, regen } from "../logic/stamina";
import { activeSkills } from "../logic/specs";
import { castBlock, spendCast, gainEmber, tickSkills, tickBuff, applyBuff, EMBER, CAST_LOCK } from "../logic/skills";
import { resolveCircle } from "../logic/collision";
import { hitPoise, isStaggered, heavyMultipliers } from "../logic/poise";
import { $, AC, DC, HC, PC, PLAYER_RADIUS, applyDerived, beacons, cam, env, camForward, camera, flashStamina, floater, fx, keys, player, playerLight, playerMesh, saveGame, sword, toast, ui, world } from "./core";
import { damageMulAt } from "../logic/darkness";
import { enemies, type Enemy } from "./enemies";
import { syncTrace } from "./sanctuary";
import { spawnLoot } from "./loot";
import { renderCharPanel } from "./panels";
import { reportBounty, reportQuest } from "./questflow";
import { tutorialEvent } from "./tutorial";
import { bossCfg, type BossId } from "../logic/boss";

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
  tutorialEvent("dodge");
  player.attackT = 0;
  player.charging = false;
  sfx.dodge();
}

export function tryAttack() {
  if (player.dead || player.attackCd > 0 || player.dodgeT !== null || player.charging) return;
  const cm = player.atkMod;
  if (!spend(player.stamina, AC.staminaCost * cm.staminaMul)) return flashStamina();
  faceTarget();
  tutorialEvent("attack");
  player.attackKind = "light";
  player.attackT = AC.time;
  player.attackCd = AC.cooldown * cm.cooldownMul;
  sfx.swing();
  if (strike(AC.range * cm.rangeMul, AC.arcDeg * cm.arcMul, 1, AC.poiseDamage, AC.hitstop, false) > 0) gainEmber(player.sk, EMBER.gainLight);
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
  tutorialEvent("heavy");
  player.attackKind = "heavy";
  player.attackT = HC.time;
  player.attackCd = HC.cooldown;
  sfx.heavySwing();
  if (strike(HC.range * player.atkMod.rangeMul, HC.arcDeg * player.atkMod.arcMul, dmgMul, poiseDmg, HC.hitstop, true) > 0) gainEmber(player.sk, EMBER.gainHeavy);
}

export interface StrikeOpts { critAdd?: number; skill?: boolean }
/** 부채꼴 타격. 맞힌 적 수를 반환한다. */
export function strike(range: number, arcDeg: number, mul: number, poiseDmg: number, hitstop: number, heavy: boolean, opts: StrikeOpts = {}): number {
  const fwd = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  const arc = Math.cos((arcDeg / 2) * (Math.PI / 180));
  let hits = 0;
  const buffed = player.buff.t > 0;
  for (const e of enemies) {
    if (e.state === "dead") continue;
    const to = e.pos.clone().sub(player.pos).setY(0);
    const d = to.length();
    if (d > range + e.def.size * 0.6) continue;
    if (d > 0.3 && to.normalize().dot(fwd) < arc) continue;
    const staggered = isStaggered(e.poise);
    const r = computeDamage({ atk: player.atk * (buffed ? player.buff.atkMul : 1), def: e.def.def, skillMul: mul * (opts.skill ? player.skillPower : 1), critChance: player.crit + (buffed ? player.buff.crit : 0) + (opts.critAdd ?? 0), staggered });
    const broke = hitPoise(e.poise, poiseDmg, { ...PC, max: e.def.poise });
    hitEnemy(e, r.amount, r.crit || staggered, heavy, broke);
    hits++;
  }
  if (hits > 0) {
    fx.addHitstop(hitstop);
    fx.addShake(heavy ? 0.7 : 0.35);
    heavy ? sfx.heavyHit() : sfx.hit();
  }
  return hits;
}

// ---------- 스킬 (1~4) ----------
export function castSkill(slot: number) {
  const list = scaledList(activeSkills(player.cls, player.spec), player.skillLv);
  const sk = list[slot];
  if (!sk || player.dead || player.dodgeT !== null || player.dash || player.charging) return;
  const why = castBlock(player.sk, slot, list);
  if (why === "ember") { floater(player.pos.clone().setY(player.pos.y + (2.3)), "잔불 부족", "hurt"); return; }
  if (why === "cooldown" || !spendCast(player.sk, slot, list)) return;
  faceTarget();
  tutorialEvent("skill");
  const fwd = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
  player.attackKind = "heavy";
  player.attackT = CAST_LOCK;
  player.attackCd = Math.max(player.attackCd, CAST_LOCK * 0.6);
  floater(player.pos.clone().setY(player.pos.y + (2.5)), sk.name, "exp");
  const opts: StrikeOpts = { critAdd: sk.critAdd, skill: true };
  switch (sk.type) {
    case "arc":
      sfx.heavySwing();
      fx.burst(player.pos.clone().addScaledVector(fwd, sk.range! * 0.5).setY(player.pos.y + 1), sk.color, 18, 6);
      strike(sk.range!, sk.arcDeg!, sk.mul!, sk.poise!, HC.hitstop, true, opts);
      break;
    case "ring":
      sfx.heavySwing();
      fx.burst(player.pos.clone().setY(player.pos.y + (0.5)), sk.color, 44, 8);
      fx.addShake(0.5);
      strike(sk.range!, 360, sk.mul!, sk.poise!, HC.hitstop, true, opts);
      break;
    case "dash": {
      sfx.dodge();
      const dir = moveInput();
      if (dir.lengthSq() === 0) dir.copy(fwd);
      dir.normalize();
      player.facing = Math.atan2(dir.x, dir.z);
      player.dash = { dir, t: sk.time!, speed: sk.dist! / sk.time!, skill: sk };
      if (sk.invuln) player.skillInvT = sk.invuln;
      break;
    }
    case "buff":
      sfx.ignite();
      if (sk.heal) {
        const before = player.hp;
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * sk.heal);
        floater(player.pos.clone().setY(player.pos.y + (2.1)), `+${Math.round(player.hp - before)}`, "exp");
      }
      applyBuff(player.buff, sk);
      fx.burst(player.pos.clone().setY(player.pos.y + (1)), sk.color, 26, 5);
      break;
  }
}

export function hitEnemy(e: Enemy, amount: number, crit: boolean, heavy: boolean, broke: boolean) {
  e.hp -= amount;
  e.flashT = 0.12;
  floater(e.pos.clone().setY(e.pos.y + (1.6 + e.def.size * 0.4)), String(amount), crit ? "crit" : "");
  fx.burst(e.pos.clone().setY(e.pos.y + (0.8)), "#ffb347", heavy ? 10 : 5, heavy ? 5 : 3.5);
  const push = e.pos.clone().sub(player.pos).setY(0).normalize().multiplyScalar((heavy ? 1.1 : 0.5) / Math.max(0.7, e.def.size));
  e.pos.add(push);
  if (broke) {
    e.state = "stagger";
    e.t = 0;
    floater(e.pos.clone().setY(e.pos.y + (2.4)), "그로기!", "crit");
    sfx.stagger();
  } else if (e.state === "wander") e.state = "chase";
  if (e.hp <= 0) killEnemy(e);
}

export function killEnemy(e: Enemy) {
  e.state = "dead";
  e.t = 0;
  e.respawnT = e.boss ? bossCfg(e.id as BossId).respawnSec : 8;
  e.hpBar.visible = false;
  if (cam.target === e) cam.target = null;
  fx.burst(e.pos.clone().setY(e.pos.y + (0.6)), e.def.eyeColor, 18, 5);
  fx.burst(e.pos.clone().setY(e.pos.y + (0.6)), "#2a2433", 10, 3);
  gainEmber(player.sk, EMBER.gainKill);
  reportQuest("kill", e.id);
  reportBounty(e.id);
  sfx.kill();
  const gold = rollRange(e.def.gold as [number, number]);
  player.gold += gold;
  const r = gainExp(player.lv, e.def.exp);
  player.lv = r.state;
  player.embers = { ...player.embers, held: player.embers.held + e.def.embers };
  floater(e.pos.clone().setY(e.pos.y + (2.2)), `+${e.def.exp} EXP  ◆${gold}  ✦${e.def.embers}`, "exp");
  if (r.levelsGained > 0) onLevelUp();
  const drop = e.boss ? generateItem(Math.random, e.def.level + 2, { rarity: bossCfg(e.id as BossId).guaranteedRarity as RarityId }) : rollDrop(Math.random, e.def.level, e.def.dropChance);
  if (drop) spawnLoot(drop, e.pos);
  const got: string[] = [];
  for (const m of rollMatDrops(Math.random, { level: e.def.level, ai: e.def.ai, embers: e.def.embers })) {
    const res = bagAdd(player.bag, m.id, m.n);
    player.bag = res.bag;
    if (res.added) got.push(`${MATS[m.id].name} ×${res.added}`);
  }
  if (got.length) floater(e.pos.clone().setY(e.pos.y + 3), got.join("  "), "exp");
  if (e.boss) { toast(`${e.def.name} 쓰러뜨림!`); fx.addShake(1); }
}

export function onLevelUp() {
  applyDerived(true);
  toast(`레벨 업!  Lv ${player.lv.level}  —  C: 능력치 배분`);
  saveGame();
  renderCharPanel();
  fx.burst(player.pos.clone().setY(player.pos.y + (1)), "#ffcc66", 30, 6);
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

let lastX = 0, lastZ = 0;
/** H: 물약 마시기 */
export function drinkPotion() {
  if (player.dead) return;
  const r = usePotion(player.hp, player.maxHp, player.bag, player.potionCd);
  if (!r.ok) {
    if (r.reason === "none") toast("물약이 없다");
    else if (r.reason === "full") toast("체력이 가득하다");
    return;
  }
  player.hp = r.hp;
  player.bag = r.bag;
  player.potionCd = MATS.potion.cooldown;
  floater(player.pos.clone().setY(player.pos.y + 2.2), `+${r.healed}`, "heal");
  fx.burst(player.pos.clone().setY(player.pos.y + 1), "#7ee8a0", 14, 3);
  sfx.pickup();
  saveGame();
}

export function updatePlayer(dt: number) {
  if (player.potionCd > 0) player.potionCd = Math.max(0, player.potionCd - dt);
  player.pos.y = heightAt(player.pos.x, player.pos.z);
  if (dt > 0) {
    const moved = Math.hypot(player.pos.x - lastX, player.pos.z - lastZ);
    if (moved > 0.001 && moved < 3 && !player.dead) tutorialEvent("move", moved);
  }
  lastX = player.pos.x; lastZ = player.pos.z;
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.hurtT = Math.max(0, player.hurtT - dt);
  if (player.dead) return;
  regen(player.stamina, player.charging ? 0 : dt, combatCfg.stamina);
  ui.stFlash = Math.max(0, ui.stFlash - dt);
  player.dodgeCd = Math.max(0, player.dodgeCd - dt);
  if (player.charging) player.chargeT = Math.min(HC.maxCharge, player.chargeT + dt);
  tickSkills(player.sk, dt);
  tickBuff(player.buff, dt);
  player.skillInvT = Math.max(0, player.skillInvT - dt);
  playerLight.intensity = player.buff.t > 0 ? 11 : 6;

  // 스킬 돌진: 입력을 무시하고 짧게 쇄도, 끝나면 타격 판정
  if (player.dash) {
    const d = player.dash;
    const step = Math.min(dt, d.t);
    player.pos.addScaledVector(d.dir, d.speed * step);
    resolveCircle(player.pos, PLAYER_RADIUS, world.obstacles);
    d.t -= dt;
    playerMesh.position.copy(player.pos);
    playerMesh.rotation.y = player.facing;
    if (step > 0) fx.burst(player.pos.clone().setY(player.pos.y + (0.4)), d.skill.color, 2, 2);
    if (d.t <= 0) {
      player.dash = null;
      const sk = d.skill;
      if (sk.mul) strike(sk.range!, sk.arcDeg!, sk.mul, sk.poise ?? 30, HC.hitstop, true, { critAdd: sk.critAdd, skill: true });
    }
    return;
  }

  // 회피 구르기: 이동 입력 무시, 빠르게 미끄러지며 한 바퀴 구름
  if (player.dodgeT !== null) {
    player.dodgeT += dt;
    const k = player.dodgeT / DC.time;
    player.pos.addScaledVector(player.dodgeDir, DC.speed * (1 - k * 0.6) * dt);
    resolveCircle(player.pos, PLAYER_RADIUS, world.obstacles);
    playerMesh.position.copy(player.pos);
    playerMesh.position.y = player.pos.y + Math.sin(Math.min(1, k) * Math.PI) * 0.25;
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
    let speed = prog.base.moveSpeed * player.moveMul;
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
  playerMesh.position.y = player.pos.y + (moving ? Math.abs(Math.sin(performance.now() / 110)) * 0.06 : 0);
  playerMesh.rotation.y = player.facing;
}

export function hurtPlayer(rawAmount: number) {
  if (player.dead) return;
  const amount = Math.max(1, Math.round(rawAmount * damageMulAt(env.dark)));
  player.hp = Math.max(0, player.hp - amount);
  player.hurtT = 0.2;
  player.charging = false;
  floater(player.pos.clone().setY(player.pos.y + (2)), `-${amount}`, "hurt");
  fx.addShake(0.5);
  fx.burst(player.pos.clone().setY(player.pos.y + (1)), "#e2553c", 6, 3);
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
      camera.position.copy(player.pos).addScaledVector(camForward(), -cam.dist * 0.74).setY(player.pos.y + cam.height);
      playerMesh.rotation.z = 0;
    }, 2500);
  }
}
