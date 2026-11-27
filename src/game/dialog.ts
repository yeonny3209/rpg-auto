// NPC 대화창: 제안(수락) / 진행 중 / 보고(보상) / 잡담. F·Enter·Space = 확인, Esc = 닫기.
import { $, player, saveGame, toast } from "./core";
import { enhanceCost, tryEnhance, canEnhance, successChanceOf, plusOf, ENH } from "../logic/enhance";
import { SLOT_IDS, type Item, type SlotId } from "../logic/items";
import { applyDerived } from "./core";
import { renderCharPanel } from "./panels";
import { bagAdd, bagTake, countOf, MATS, type MatId } from "../logic/bag";
import { RECIPES, craft, shortfall } from "../logic/crafting";
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
let enhMode = false;
let craftMode = false;
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
      <div><div class="shop-h">구매</div>
        <div class="shop-row" data-act="buyPotion" style="border-color:#7ee8a0"><span style="color:#7ee8a0">${MATS.potion.name} (보유 ${countOf(player.bag, "potion")}/${MATS.potion.max})</span><span class="sp">◆ ${MATS.potion.price}</span></div>
        ${stock.map((it, i) => cell(it, "buy", i, buyPrice(it))).join("")}</div>
      <div><div class="shop-h">판매 (가방 ${player.inventory.length}/${ITEM_CFG.inventorySize})</div>
        ${(["ashLump"] as MatId[]).filter((id) => countOf(player.bag, id) > 0).map((id) => `<div class="shop-row" data-act="sellMat" data-id="${id}" style="border-color:#8f98a6"><span>${MATS[id].name} ×${countOf(player.bag, id)}</span><span class="sp">개당 ◆ ${MATS[id].price}</span></div>`).join("")}${player.inventory.length ? player.inventory.map((it, i) => cell(it, "sell", i, sellPrice(it))).join("") : '<div class="shop-empty">팔 물건이 없다</div>'}</div>
    </div>
    <div id="shopTip" class="tooltip">물건을 클릭하면 사고 판다. 마우스를 올리면 정보가 보인다.</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  const tip = $("shopTip");
  $("dialog").querySelectorAll<HTMLElement>('.shop-row[data-act="buyPotion"], .shop-row[data-act="sellMat"]').forEach((row) => {
    const isBuy = row.dataset.act === "buyPotion", id = (isBuy ? "potion" : row.dataset.id) as MatId;
    row.addEventListener("mouseenter", () => (tip.textContent = MATS[id].desc));
    row.addEventListener("click", () => {
      if (isBuy) {
        if (player.gold < MATS.potion.price) return toast("골드가 부족하다");
        const r = bagAdd(player.bag, "potion", 1);
        if (!r.added) return toast("물약을 더 들 수 없다");
        player.gold -= MATS.potion.price; player.bag = r.bag; sfx.pickup(); toast("물약 구매");
      } else {
        const nb = bagTake(player.bag, id, 1);
        if (!nb) return;
        player.bag = nb; player.gold += MATS[id].price; sfx.pickup();
      }
      saveGame(); renderShop();
    });
  });
  $("dialog").querySelectorAll<HTMLElement>('.shop-row[data-act="buy"], .shop-row[data-act="sell"]').forEach((row) => {
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

const label = (it: Item) => (plusOf(it) ? `+${plusOf(it)} ` : "") + it.name;

function renderEnhance() {
  type Ref = { it: Item; slot?: SlotId; idx?: number };
  const refs: Ref[] = [
    ...SLOT_IDS.filter((s) => player.equipment[s]).map((s) => ({ it: player.equipment[s]!, slot: s })),
    ...player.inventory.map((it, idx) => ({ it, idx })),
  ];
  const row = (r: Ref, i: number) => {
    const c = rarityOf(r.it.rarity).color;
    const info = canEnhance(r.it) ? `◆ ${enhanceCost(r.it)} · ${Math.round(successChanceOf(r.it) * 100)}%` : "최대";
    return `<div class="shop-row" data-i="${i}" style="border-color:${c}"><span style="color:${c}">${r.slot ? "[장착] " : ""}${label(r.it)}</span><span class="sp">${info}</span></div>`;
  };
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">강화 · 보유 ◆ ${player.gold}</span></div>
    <div class="shop-h">장비를 클릭하면 강화를 시도한다. 실패해도 단계는 내려가지 않고 골드만 든다. (최대 +${ENH.maxPlus})</div>
    <div class="shop-cols" style="grid-template-columns:1fr">${refs.length ? refs.map(row).join("") : '<div class="shop-empty">강화할 장비가 없다</div>'}</div>
    <div id="shopTip" class="tooltip">마우스를 올리면 정보가 보인다.</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  const tip = $("shopTip");
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((el) => {
    const r = refs[Number(el.dataset.i)];
    el.addEventListener("mouseenter", () => (tip.innerHTML = itemTooltip(r.it)));
    el.addEventListener("click", () => {
      const res = tryEnhance(player.gold, r.it, Math.random);
      if (!res.ok) return toast(res.reason === "max" ? "이미 최대 강화다" : "골드가 부족하다");
      player.gold = res.gold;
      if (r.slot) player.equipment = { ...player.equipment, [r.slot]: res.item };
      else player.inventory = player.inventory.map((x, i) => (i === r.idx ? res.item : x));
      if (res.success) { sfx.levelUp(); toast(`강화 성공! ${label(res.item)}`); } else { sfx.hurt(); toast("강화 실패… 골드만 사라졌다"); }
      applyDerived(false);
      saveGame(); renderInvPanel(); renderCharPanel(); renderEnhance();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { enhMode = false; render(); });
}

function renderCraft() {
  const rows = RECIPES.map((r, i) => {
    const lack = shortfall(r, player.bag, player.gold);
    const need = [...Object.entries(r.needs).map(([id, n]) => `${MATS[id as MatId].name} ${countOf(player.bag, id as MatId)}/${n}`), r.gold ? `◆ ${r.gold}` : ""].filter(Boolean).join(" · ");
    return `<div class="shop-row" data-i="${i}" style="border-color:${lack.length ? "#4a5160" : "#ffb347"};opacity:${lack.length ? 0.6 : 1}"><span>${r.name}</span><span class="craft-need${lack.length ? "" : ""}">${need}</span></div>`;
  });
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">제작 · ◆ ${player.gold}</span></div>
    <div class="shop-h">재료를 모으면 장비와 물약을 만들 수 있다. 장비의 능력치는 지금 레벨 기준으로 정해진다.</div>
    <div class="shop-cols" style="grid-template-columns:1fr">${rows.join("")}</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((el) => {
    el.addEventListener("click", () => {
      const r = RECIPES[Number(el.dataset.i)];
      const res = craft(r, player.bag, player.gold, player.inventory, player.lv.level, Math.random);
      if (!res.ok) return toast(res.reason === "lack" ? `부족: ${res.lack!.join(", ")}` : res.reason === "full" ? "장비 가방이 가득 찼다" : "물약을 더 들 수 없다");
      player.bag = res.bag; player.gold = res.gold; player.inventory = res.inv;
      sfx.equip(); toast(`제작 완료 — ${res.made}`);
      saveGame(); renderInvPanel(); renderCraft();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { craftMode = false; render(); });
}

function render() {
  if (!current) return;
  if (craftMode) return renderCraft();
  if (shopMode) return renderShop();
  if (enhMode) return renderEnhance();
  const d = dialogFor(current.def, player.quests);
  const q = d.quest;
  const primary = d.kind === "offer" ? "수락" : d.kind === "turnin" ? "보상 받기" : "닫기";
  const objectives = q && d.kind !== "idle"
    ? `<div class="dq"><div class="dqn">${q.chapter} — ${q.name}</div>` +
      (d.kind === "turnin" ? "" : q.objectives.map((o, i) => `<div class="dqo">· ${o.label} ${d.kind === "offer" ? "" : `${player.quests.active[q.id]?.[i] ?? 0}/`}${o.count}${d.kind === "offer" ? "회" : ""}</div>`).join("")) +
      `<div class="dqr">보상: ${rewardText(q)}</div></div>` : "";
  $("dialog").innerHTML = `<div class="dn">${current.def.name} <span class="dr">${current.def.role}</span></div>
    <div class="dt">${d.text}</div>${objectives}
    <div class="db">${current.def.id === "merchant" ? `<button data-act="shop">거래</button>` : ""}${current.def.id === "smith" ? `<button data-act="enh">강화</button><button data-act="craft">제작</button>` : ""}<button data-act="primary">${primary} <kbd>F</kbd></button>${d.kind === "offer" ? `<button data-act="close">다음에 <kbd>Esc</kbd></button>` : ""}</div>`;
  $("dialog").querySelectorAll<HTMLElement>("button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.act === "shop") { shopMode = true; shopLevel = player.lv.level; render(); }
      else if (b.dataset.act === "enh") { enhMode = true; render(); }
      else if (b.dataset.act === "craft") { craftMode = true; render(); }
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
  enhMode = false;
  craftMode = false;
  $("dialog").classList.remove("open");
}
export function dialogPrimary() {
  if (!current) return;
  if (shopMode || enhMode || craftMode) { shopMode = enhMode = craftMode = false; render(); return; }
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
