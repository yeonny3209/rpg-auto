// NPC 대화창: 제안(수락) / 진행 중 / 보고(보상) / 잡담. F·Enter·Space = 확인, Esc = 닫기.
import { $, player, saveGame, toast } from "./core";
import { dialogFor, accept, turnIn, isReady, type Dialog } from "../logic/quests";
import { grantRewards, renderQuestLog } from "./questflow";
import { sfx } from "./sfx";
import type { Npc } from "./npcs";
import { tutorialEvent } from "./tutorial";

let current: Npc | null = null;
export const dialogOpen = () => $("dialog").classList.contains("open");

function rewardText(q: NonNullable<Dialog["quest"]>): string {
  const r = q.rewards, out: string[] = [];
  if (r.exp) out.push(`EXP ${r.exp}`);
  if (r.gold) out.push(`◆ ${r.gold}`);
  if (r.item) out.push(`장비 1개(${r.item.rarity === "rare" ? "희귀" : r.item.rarity})`);
  return out.join(" · ");
}

function render() {
  if (!current) return;
  const d = dialogFor(current.def, player.quests);
  const q = d.quest;
  const primary = d.kind === "offer" ? "수락" : d.kind === "turnin" ? "보상 받기" : "닫기";
  const objectives = q && d.kind !== "idle"
    ? `<div class="dq"><div class="dqn">${q.chapter} — ${q.name}</div>` +
      (d.kind === "turnin" ? "" : q.objectives.map((o, i) => `<div class="dqo">· ${o.label} ${d.kind === "offer" ? "" : `${player.quests.active[q.id]?.[i] ?? 0}/`}${o.count}${d.kind === "offer" ? "회" : ""}</div>`).join("")) +
      `<div class="dqr">보상: ${rewardText(q)}</div></div>` : "";
  $("dialog").innerHTML = `<div class="dn">${current.def.name} <span class="dr">${current.def.role}</span></div>
    <div class="dt">${d.text}</div>${objectives}
    <div class="db"><button data-act="primary">${primary} <kbd>F</kbd></button>${d.kind === "offer" ? `<button data-act="close">다음에 <kbd>Esc</kbd></button>` : ""}</div>`;
  $("dialog").querySelectorAll<HTMLElement>("button").forEach((b) =>
    b.addEventListener("click", () => (b.dataset.act === "primary" ? dialogPrimary() : closeDialog())));
}

export function openDialog(npc: Npc) {
  tutorialEvent("talk");
  current = npc;
  $("dialog").classList.add("open");
  render();
}
export function closeDialog() {
  current = null;
  $("dialog").classList.remove("open");
}
export function dialogPrimary() {
  if (!current) return;
  const d = dialogFor(current.def, player.quests);
  if (d.kind === "offer" && d.quest) {
    const next = accept(player.quests, d.quest.id);
    if (next) { player.quests = next; toast(`퀘스트 수락 — ${d.quest.name}`); sfx.pickup(); }
  } else if (d.kind === "turnin" && d.quest && isReady(player.quests, d.quest)) {
    const r = turnIn(player.quests, d.quest.id);
    if (r) { player.quests = r.qs; grantRewards(r.rewards); toast(`퀘스트 완료 — ${d.quest.name}`); sfx.levelUp(); }
  }
  renderQuestLog();
  saveGame();
  closeDialog();
}
