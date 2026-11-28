import { regionAt } from "../logic/regions";
import * as THREE from "three";
import { heightAt } from "../logic/terrain";
import { setLit, type Beacon } from "./beacons";
import wdata from "../../data/world.json";
import { recoverTrace, engrave, engraveBonus } from "../logic/embers";
import { sfx } from "./sfx";
import { gainExp } from "../logic/progression";
import { $, BC, EC, applyDerived, beacons, floater, fx, player, saveGame, scene, toast } from "./core";
import { onLevelUp } from "./player";
import { nearNpc } from "./npcs";
import { openDialog } from "./dialog";
import { reportQuest } from "./questflow";
import { tutorialEvent } from "./tutorial";

// ---------- 봉화·잔불 ----------
export function nearBeacon(range: number): Beacon | null {
  let best: Beacon | null = null, bd = range;
  for (const b of beacons) {
    const d = b.pos.distanceTo(player.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
export function interact() {
  if (player.dead) return;
  const b = nearBeacon(BC.interactRange);
  const n = nearNpc();
  if (n && (!b || n.pos.distanceTo(player.pos) <= b.pos.distanceTo(player.pos))) { openDialog(n); return; }
  if (!b) return;
  tutorialEvent("beacon");
  if (!b.lit) {
    setLit(b, true);
    player.respawnBeacon = b.def.id;
    const r = gainExp(player.lv, BC.lightExp);
    player.lv = r.state;
    toast(`봉화 점화 — ${b.def.name}`);
    reportQuest("beacon", b.def.id);
    floater(b.pos.clone().setY(b.pos.y + (3)), `+${BC.lightExp} EXP`, "exp");
    fx.burst(b.pos.clone().setY(b.pos.y + (1.6)), "#ffcc66", 40, 7);
    fx.addShake(0.4);
    sfx.ignite();
    if (r.levelsGained > 0) onLevelUp();
    // 지역별로 판정: 같은 지역의 봉화를 모두 밝혔을 때
    const rg = regionAt(b.pos.x, b.pos.z);
    const inRegion = beacons.filter((x) => regionAt(x.pos.x, x.pos.z).id === rg.id);
    if (inRegion.every((x) => x.lit)) setTimeout(() => toast(`${rg.name}의 봉화를 모두 밝혔다!`), 1800);
  } else {
    player.respawnBeacon = b.def.id;
    player.hp = player.maxHp;
    if (player.embers.held > 0) {
      const before = engraveBonus(player.embers.banked).level;
      const amount = player.embers.held;
      player.embers = engrave(player.embers);
      const after = engraveBonus(player.embers.banked).level;
      applyDerived(true);
      floater(b.pos.clone().setY(b.pos.y + (3)), `✦${amount} 각인`, "exp");
      fx.burst(player.pos.clone().setY(player.pos.y + (1)), "#ffb347", 20, 4);
      sfx.ignite();
      toast(after > before ? `각인 레벨 ${after}! 공격력 +${after}%, 최대 HP +${after * EC.hpPerLevel}` : `잔불 ${amount} 각인`);
    } else toast(`${b.def.name}에서 쉬었다`);
  }
  saveGame();
}

// 사망 흔적
export const traceGroup = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: "#ff9a3c", emissive: "#ff6a1a", emissiveIntensity: 2, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.TetrahedronGeometry(0.18 - i * 0.04, 0), m);
    o.position.set(Math.cos(i * 2.1) * 0.3, 0.6 + i * 0.25, Math.sin(i * 2.1) * 0.3);
    traceGroup.add(o);
  }
  const l = new THREE.PointLight("#ff8a2a", 4, 5, 1.5);
  l.position.y = 0.8;
  traceGroup.add(l);
  traceGroup.visible = false;
  scene.add(traceGroup);
}
export function syncTrace() {
  traceGroup.visible = !!player.trace;
  if (player.trace) traceGroup.position.set(player.trace.x, heightAt(player.trace.x, player.trace.z), player.trace.z);
}
export function updateTrace(dt: number, t: number) {
  if (!player.trace) return;
  traceGroup.rotation.y += dt * 1.5;
  traceGroup.position.y = heightAt(traceGroup.position.x, traceGroup.position.z) + Math.sin(t * 2.5) * 0.1;
  const dx = player.trace.x - player.pos.x, dz = player.trace.z - player.pos.z;
  if (!player.dead && dx * dx + dz * dz < EC.tracePickupRange ** 2) {
    floater(player.pos.clone().setY(player.pos.y + (2.2)), `✦${player.trace.amount} 되찾음`, "exp");
    player.embers = recoverTrace(player.embers, player.trace);
    player.trace = null;
    syncTrace();
    sfx.pickup();
    saveGame();
  }
}
syncTrace();

// 봉화 근처에서는 천천히 회복
export function updateBeacon(dt: number) {
  if (player.dead || player.hp >= player.maxHp) return;
  if (beacons.some((b) => b.lit && b.pos.distanceTo(player.pos) < BC.healRange))
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * BC.healPerSec * dt);
}
