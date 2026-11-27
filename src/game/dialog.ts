// NPC 대화창: 제안(수락) / 진행 중 / 보고(보상) / 잡담. F·Enter·Space = 확인, Esc = 닫기.
import { $, player, saveGame, toast } from "./core";
import { buyPrice, sellPrice, makeStock, tryBuy, trySell } from "../logic/shop";
import { ITEM_CFG } from "../logic/items";
import { itemTooltip, renderInvPanel } from "./panels";
import { dialogFor, accept, turnIn, isReady, type Dialog } from "../logic/quests";
import { grantRewards, renderQuestLog } from "./questflow";
import { sfx } from "./sfx";
import { rarityOf, type RarityId } from "../logic/items";
import type { Npc } from "./npcs";
import { tutorialEvent } from "./tutorial";

let current: Npc | null = null;
let shopMode = false;
let shopLevel = 1;
export const dialogOpen = () => $("dialog").classList.contains("open");

function rewardText(q: NonNullable<Dialog["quest"]>): string {
  const r = q.rewards, out: string[] = [];
  if (r.exp) out.push(`EXP ${r.exp}`);
  if (r.gold) out.push(`◆ ${r.gold}`);
  if (r.item) out.push(`장비 1개(${rarityOf(r.item.rarity as RarityId).name})`);
  return out.join(" · ");
}

function renderShop() {
  const stock = makeStock(shopLevel);
  const cell = (it: any, act: string, i: number, price: number) => {
    const c = rarityOf(it.rarity).color;
    return `<div class="shop-row" data-act="${act}" data-i="${i}" style="border-color:${c}"><span style="color:${c}">${it.name}</span><span class="sp">◆ ${price}</span></div>`;
  };
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">거래 · 보유 ◆ ${player.gold}</span></div>
    <div class="shop-cols">
      <div><div class="shop-h">구매</div>${stock.map((it, i) => cell(it, "buy", i, buyPrice(it))).join("")}</div>
      <div><div class="shop-h">판매 (가방 ${player.inventory.length}/${ITEM_CFG.inventorySize})</div>${player.inventory.length ? player.inventory.map((it, i) => cell(it, "sell", i, sellPrice(it))).join("") : '<div class="shop-empty">팔 물건이 없다</div>'}</div>
    </div>
    <div id="shopTip" class="tooltip">물건을 클릭하면 사고 판다. 마우스를 올리면 정보가 보인다.</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  const tip = $("shopTip");
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((row) => {
    const i = Number(row.dataset.i), buying = row.dataset.act === "buy";
    const it = buying ? stock[i] : player.inventory[i];
    row.addEventListener("mouseenter", () => (tip.innerHTML = itemTooltip(it)));
    row.addEventListener("click", () => {
      if (buying) {
        const r = tryBuy(player.gold, player.inventory, it, ITEM_CFG.inventorySize);
        if (!r.ok) return toast(r.reason === "gold" ? "골드가 부족하다" : "가방이 가득 찼다");
        player.gold = r.gold; player.inventory = r.inv; sfx.pickup(); toast(`구매 — ${it.name}`);
      } else {
        const r = trySell(player.gold, player.inventory, i);
        if (!r.ok) return;
        player.gold = r.gold; player.inventory = r.inv; sfx.pickup(); toast(`판매 +◆${r.price}`);
      }
      saveGame(); renderInvPanel(); renderShop();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { shopMode = false; render(); });
}

function render() {
  if (!current) return;
  if (shopMode) return renderShop();
  const d = dialogFor(current.def, player.quests);
  const q = d.quest;
  const primary = d.kind === "offer" ? "수락" : d.kind === "turnin" ? "보상 받기" : "닫기";
  const objectives = q && d.kind !== "idle"
    ? `<div class="dq"><div class="dqn">${q.chapter} — ${q.name}</div>` +
      (d.kind === "turnin" ? "" : q.objectives.map((o, i) => `<div class="dqo">· ${o.label} ${d.kind === "offer" ? "" : `${player.quests.active[q.id]?.[i] ?? 0}/`}${o.count}${d.kind === "offer" ? "회" : ""}</div>`).join("")) +
      `<div class="dqr">보상: ${rewardText(q)}</div></div>` : "";
  $("dialog").innerHTML = `<div class="dn">${current.def.name} <span class="dr">${current.def.role}</span></div>
    <div class="dt">${d.text}</div>${objectives}
    <div class="db">${current.def.id === "merchant" ? `<button data-act="shop">거래</button>` : ""}<button data-act="primary">${primary} <kbd>F</kbd></button>${d.kind === "offer" ? `<button data-act="close">다음에 <kbd>Esc</kbd></button>` : ""}</div>`;
  $("dialog").querySelectorAll<HTMLElement>("button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.act === "shop") { shopMode = true; shopLevel = player.lv.level; render(); }
      else if (b.dataset.act === "primary") dialogPrimary();
      else closeDialog();
    }));
}

export function openDialog(npc: Npc) {
  tutorialEvent("talk");
  current = npc;
  $("dialog").classList.add("open");
  render();
}
export function closeDialog() {
  current = null;
  shopMode = false;
  $("dialog").classList.remove("open");
}
export function dialogPrimary() {
  if (!current) return;
  if (shopMode) { shopMode = false; render(); return; }
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
