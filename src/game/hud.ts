import { scaledList, levelOf } from "../logic/skillLevel";
import { activeSkills } from "../logic/specs";
import { castBlock, EMBER } from "../logic/skills";
import { engrave, engraveBonus, nextLevelProgress } from "../logic/embers";
import { expToNext } from "../logic/progression";
import { rarityOf } from "../logic/items";
import { $, toast, BC, HC, beacons, cam, camera, env, floaters, player, scene, ui } from "./core";
import * as THREE from "three";
import { darknessAt, fogFarAt } from "../logic/darkness";
import { regionAt, dangerOf } from "../logic/regions";
import { enemies } from "./enemies";
import { nearBeacon } from "./sanctuary";
import { loots } from "./loot";
import { nearNpc } from "./npcs";

// ---------- 미니맵 ----------
export const mini = document.getElementById("minimap") as HTMLCanvasElement;
export const mctx = mini.getContext("2d")!;
export const MINI_RANGE = 45; // 미니맵 반경(월드 단위)
export function drawMinimap() {
  const W = mini.width, R = W / 2, k = R / MINI_RANGE;
  mctx.clearRect(0, 0, W, W);
  mctx.save();
  mctx.beginPath();
  mctx.arc(R, R, R - 1, 0, Math.PI * 2);
  mctx.clip();
  mctx.fillStyle = "#151b24e0";
  mctx.fillRect(0, 0, W, W);
  // 카메라가 바라보는 방향이 위쪽이 되도록 회전
  const toMini = (x: number, z: number): [number, number] => {
    const dx = x - player.pos.x, dz = z - player.pos.z;
    const c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
    const fwd = dx * sn + dz * c; // 카메라 전방 성분
    const right = -dx * c + dz * sn; // 화면 오른쪽 성분 (moveInput의 r과 같은 축)
    return [R + right * k, R - fwd * k];
  };
  // 밝혀진 영역
  for (const b of beacons) if (b.lit) {
    const [x, y] = toMini(b.pos.x, b.pos.z);
    const g = mctx.createRadialGradient(x, y, 0, x, y, BC.lightRadius * k);
    g.addColorStop(0, "#ff9a3c55");
    g.addColorStop(1, "#ff9a3c00");
    mctx.fillStyle = g;
    mctx.beginPath(); mctx.arc(x, y, BC.lightRadius * k, 0, Math.PI * 2); mctx.fill();
  }
  const dot = (x: number, z: number, r: number, color: string) => {
    const [px, py] = toMini(x, z);
    mctx.fillStyle = color;
    mctx.beginPath(); mctx.arc(px, py, r, 0, Math.PI * 2); mctx.fill();
  };
  for (const e of enemies) if (e.state !== "dead") dot(e.pos.x, e.pos.z, e.boss ? 5 : e.def.ai === "charger" ? 3 : 2, e.boss ? "#ff3a1a" : e.state === "chase" || e.state === "windup" ? "#ff5a4a" : "#a05a6a");
  for (const l of loots) dot(l.group.position.x, l.group.position.z, 2.5, rarityOf(l.item.rarity).color);
  if (player.trace) dot(player.trace.x, player.trace.z, 3.5, "#ff8a2a");
  for (const b of beacons) {
    const [x, y] = toMini(b.pos.x, b.pos.z);
    // 범위 밖 봉화는 테두리에 방향 표시
    const dx = x - R, dy = y - R, d = Math.hypot(dx, dy), lim = R - 7;
    const px = d > lim ? R + (dx / d) * lim : x, py = d > lim ? R + (dy / d) * lim : y;
    mctx.fillStyle = b.lit ? "#ffcc66" : "#7d8694";
    mctx.strokeStyle = "#000";
    mctx.beginPath();
    mctx.moveTo(px, py - 5); mctx.lineTo(px + 4, py); mctx.lineTo(px, py + 5); mctx.lineTo(px - 4, py); mctx.closePath();
    mctx.fill(); mctx.stroke();
  }
  // 플레이어 화살표 (진행 방향)
  mctx.translate(R, R);
  mctx.rotate(-(player.facing - cam.yaw) + Math.PI);
  mctx.fillStyle = "#ffffff";
  mctx.beginPath(); mctx.moveTo(0, 6); mctx.lineTo(4, -4); mctx.lineTo(0, -2); mctx.lineTo(-4, -4); mctx.closePath(); mctx.fill();
  mctx.restore();
  mctx.strokeStyle = "#5a4a30";
  mctx.lineWidth = 2;
  mctx.beginPath(); mctx.arc(R, R, R - 1, 0, Math.PI * 2); mctx.stroke();
}

let skillBarCls: string | null = "__none__";
function syncSkillBar() {
  const key = `${player.cls}|${player.spec}|${JSON.stringify(player.skillLv)}`;
  if (skillBarCls === key) return;
  skillBarCls = key;
  const base = activeSkills(player.cls, player.spec);
  const list = scaledList(base, player.skillLv);
  $("skillbar").innerHTML = list.map((sk, i) => { const lv = levelOf(player.skillLv, sk.id); return `<div class="skill" data-i="${i}" style="--c:${sk.color}" title="${sk.desc}"><span class="k">${i + 1}</span><span class="n">${sk.name}</span>${lv > 1 ? `<span class="lv">Lv${lv}</span>` : ""}<span class="c">${sk.cost}</span><div class="cd"></div></div>`; }).join("");
}
const fogTarget = new THREE.Color();
let regionNow = "";
export function updateDarkness(dt: number) {
  const lit = beacons.filter((b) => b.lit).map((b) => b.def);
  const target = darknessAt(player.pos.x, player.pos.z, lit);
  env.dark += (target - env.dark) * Math.min(1, dt * 2); // 부드럽게 변화
  if (scene.fog instanceof THREE.Fog) scene.fog.far = fogFarAt(env.dark);
  { // 지역 분위기: 안개·배경색이 지역 색으로 천천히 바뀐다
    const rg = regionAt(player.pos.x, player.pos.z);
    fogTarget.set(rg.fog);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.lerp(fogTarget, Math.min(1, dt * 1.5));
    if (scene.background instanceof THREE.Color) scene.background.lerp(fogTarget, Math.min(1, dt * 1.5));
    if (rg.name !== regionNow) {
      const first = regionNow === ""; regionNow = rg.name; $("zoneTag").textContent = `${rg.name} · 권장 Lv ${rg.recommendedLevel}`;
      const dg = dangerOf(rg, player.lv.level);
      if (!first && dg !== "safe") toast(dg === "deadly" ? `${rg.name}: 권장 Lv ${rg.recommendedLevel} — 지금은 매우 위험해` : `${rg.name}: 권장 Lv ${rg.recommendedLevel} — 조금 버거울 수 있어`);
    }
  }
  $("darkTag").style.opacity = String(Math.min(1, env.dark * 1.5));
  $("darkTag").textContent = env.dark > 0.15 ? `어둠 ${Math.round(env.dark * 100)}% · 받는 피해 +${Math.round(env.dark * 35)}%` : "";
}

export function updateHud() {
  syncSkillBar();
  { // 보스 체력바: 전투 중인 보스가 있을 때만
    const boss = enemies.find((x) => x.boss && x.state !== "dead" && x.state !== "wander");
    const bb = $("bossBar");
    bb.style.display = boss ? "block" : "none";
    if (boss) {
      $("bossName").textContent = `${boss.def.name}${boss.boss!.phase === 2 ? "  — 분노" : ""}`;
      $("bossFill").style.width = `${Math.max(0, boss.hp / boss.def.hp) * 100}%`;
      $("bossPoise").style.width = `${Math.max(0, boss.poise.value / boss.def.poise) * 100}%`;
    }
  }
  const list = scaledList(activeSkills(player.cls, player.spec), player.skillLv);
  $("emFill").style.width = `${(player.sk.ember / EMBER.max) * 100}%`;
  $("skillbar").querySelectorAll<HTMLElement>(".skill").forEach((el, i) => {
    const sk = list[i];
    el.classList.toggle("ready", castBlock(player.sk, i, list) === "none");
    el.classList.toggle("noem", player.sk.ember < sk.cost);
    (el.querySelector(".cd") as HTMLElement).style.height = `${(player.sk.cds[i] / sk.cooldown) * 100}%`;
  });
  $("potions").textContent = `${player.bag.potion ?? 0}` + (player.potionCd > 0 ? ` (${player.potionCd.toFixed(0)}s)` : "");
  $("matTag").textContent = `· 재 ${player.bag.ashLump ?? 0}` + (player.bag.emberCore ? ` · 핵 ${player.bag.emberCore}` : "") + (player.bag.mireSap ? ` · 수액 ${player.bag.mireSap}` : "");
  const bt = $("buffTag");
  bt.style.display = player.buff.t > 0 ? "block" : "none";
  if (player.buff.t > 0) bt.textContent = `🔥 강화 ${player.buff.t.toFixed(1)}s`;
  $("stFill").style.width = `${(player.stamina.value / player.stamina.max) * 100}%`;
  $("stFill").parentElement!.classList.toggle("empty", ui.stFlash > 0);
  $("lvl").textContent = String(player.lv.level);
  $("hpFill").style.width = `${(player.hp / player.maxHp) * 100}%`;
  $("hpText").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  const need = expToNext(player.lv.level);
  $("expFill").style.width = need === Infinity ? "100%" : `${(player.lv.exp / need) * 100}%`;
  $("gold").textContent = String(player.gold);
  const np = nextLevelProgress(player.embers.banked);
  $("embers").textContent = `✦ ${player.embers.held}`;
  $("engrave").textContent = `각인 Lv ${engraveBonus(player.embers.banked).level} (${np.into}/${np.need})`;
  const nb0 = player.dead ? null : nearBeacon(BC.interactRange);
  const nn = player.dead ? null : nearNpc();
  const npcFirst = nn && (!nb0 || nn.pos.distanceTo(player.pos) <= nb0.pos.distanceTo(player.pos));
  const nb = npcFirst ? null : nb0;
  const pr = $("prompt");
  if (npcFirst && nn) {
    pr.style.display = "block";
    pr.innerHTML = `<b>F</b> ${nn.def.name} — 대화`;
  } else if (nb) {
    pr.style.display = "block";
    pr.innerHTML = nb.lit
      ? `<b>F</b> ${nb.def.name} — ${player.embers.held > 0 ? `잔불 ${player.embers.held} 각인` : "쉬기"}`
      : `<b>F</b> ${nb.def.name} 점화`;
  } else pr.style.display = "none";
  $("beaconCount").textContent = `봉화 ${beacons.filter((b) => b.lit).length}/${beacons.length}`;
  $("spBadge").style.display = player.lv.statPoints > 0 ? "inline-block" : "none";
  $("spBadge").textContent = `+${player.lv.statPoints} (C)`;
  const ch = $("charge");
  ch.style.opacity = player.charging ? "1" : "0";
  ($("chargeFill") as HTMLElement).style.width = `${Math.min(1, player.chargeT / HC.maxCharge) * 100}%`;
  const tgt = $("target");
  if (cam.target && cam.target.state !== "dead") {
    tgt.style.display = "block";
    const p = cam.target.pos.clone().setY(cam.target.pos.y + (cam.target.def.size * 2 + 0.6)).project(camera);
    tgt.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    tgt.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    $("targetName").textContent = cam.target.def.name;
  } else tgt.style.display = "none";
}

export function updateFloaters(dt: number) {
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
