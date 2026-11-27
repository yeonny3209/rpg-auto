// 퀘스트 이벤트 보고·보상 지급·HUD 퀘스트 목록.
import { $, player, saveGame, toast, floater } from "./core";
import { progress, questDef, isReady, NPCS, type Rewards } from "../logic/quests";
import { gainExp } from "../logic/progression";
import { generateItem, ITEM_CFG } from "../logic/items";
import { onLevelUp } from "./player";
import { spawnLoot } from "./loot";
import type { Objective } from "../logic/quests";
import * as THREE from "three";

/** 처치·봉화 같은 이벤트를 퀘스트에 반영 */
export function reportQuest(type: Objective["type"], target: string) {
  const r = progress(player.quests, type, target);
  if (!r.changed.length) return;
  player.quests = r.qs;
  for (const id of r.completed) {
    const q = questDef(id)!;
    const who = NPCS.find((n) => n.id === q.turnIn)?.name ?? "";
    toast(`목표 달성 — ${who}에게 보고하자`);
  }
  renderQuestLog();
  saveGame();
}

export function grantRewards(rw: Rewards) {
  const pos = player.pos.clone();
  if (rw.gold) { player.gold += rw.gold; floater(pos.clone().setY(2.6), `◆ +${rw.gold}`, "exp"); }
  if (rw.item) {
    const it = generateItem(Math.random, player.lv.level, { rarity: rw.item.rarity as any });
    if (player.inventory.length < ITEM_CFG.inventorySize) {
      player.inventory.push(it);
      floater(pos.clone().setY(2.9), `${it.name} 획득`, `loot r-${it.rarity}`);
    } else spawnLoot(it, pos.add(new THREE.Vector3(1, 0, 1)));
  }
  if (rw.exp) {
    const r = gainExp(player.lv, rw.exp);
    player.lv = r.state;
    floater(pos.clone().setY(2.3), `+${rw.exp} EXP`, "exp");
    if (r.levelsGained > 0) onLevelUp();
  }
}

export function renderQuestLog() {
  const el = $("questLog");
  const ids = Object.keys(player.quests.active);
  if (!ids.length) { el.style.display = "none"; return; }
  el.style.display = "block";
  el.innerHTML = `<div class="qh">퀘스트</div>` + ids.map((id) => {
    const q = questDef(id)!;
    const ready = isReady(player.quests, q);
    const who = NPCS.find((n) => n.id === q.turnIn)?.name ?? "";
    return `<div class="q ${ready ? "ready" : ""}"><div class="qn">${ready ? "✔ " : ""}${q.name}</div>` +
      (ready ? `<div class="qo">→ ${who}에게 보고</div>` :
        q.objectives.map((o, i) => `<div class="qo">${o.label} ${player.quests.active[id][i]}/${o.count}</div>`).join("")) + `</div>`;
  }).join("");
}
