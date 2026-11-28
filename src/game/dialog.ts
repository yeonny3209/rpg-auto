// NPC 대화창: 제안(수락) / 진행 중 / 보고(보상) / 잡담. F·Enter·Space = 확인, Esc = 닫기.
import { $, player, saveGame, toast } from "./core";
import { enhanceCost, tryEnhance, canEnhance, successChanceOf, plusOf, ENH } from "../logic/enhance";
import { SLOT_IDS, type Item, type SlotId } from "../logic/items";
import { applyDerived } from "./core";
import { renderCharPanel } from "./panels";
import { scaledSkill, levelOf, upgradeCost, upgradeSkill, SL } from "../logic/skillLevel";
import { activeSkills } from "../logic/specs";
import { CLASS_IDS, classDef, changeClassAttrs, classChangeCost, type ClassId } from "../logic/classes";
import { setClass } from "./core";
import { SPEC_COST, SPEC_MIN_LEVEL, specsFor, specDef, trySpecialize, validSpec, type SpecId } from "../logic/specs";
import { makeOffers, accept as acceptBounty, abandon, progressOf, turnIn as bountyTurnIn } from "../logic/bounty";
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
import { travelTargets } from "../logic/travel";
import { nearBeacon } from "./sanctuary";
import { beacons } from "./core";

let current: Npc | null = null;
let shopMode = false;
let enhMode = false;
let craftMode = false;
let trainMode = false;
let classMode = false;
let specMode = false;
let boardMode = false;
let pendingClass: ClassId | null = null;
let shopLevel = 1;
export const dialogOpen = () => $("dialog").classList.contains("open");

function rewardText(q: NonNullable<Dialog["quest"]>): string {
  const r = q.rewards, out: string[] = [];
  if (r.exp) out.push(`EXP ${r.exp}`);
  if (r.gold) out.push(`◆ ${r.gold}`);
  if (r.item) out.push(`장비 1개(${rarityOf(r.item.rarity as RarityId).name})`);
  return out.join(" · ");
}

// 품절: 레벨별 재고가 한 번씩만 팔린다(레벨이 오르면 새 재고). 세션 한정, 저장하지 않음.
const soldOut = new Set<string>();
const soldKey = (lv: number, i: number) => `${lv}:${i}`;

function renderShop() {
  const stock = makeStock(shopLevel);
  const cell = (it: any, act: string, i: number, price: number) => {
    const c = rarityOf(it.rarity).color;
    if (act === "buy" && soldOut.has(soldKey(shopLevel, i))) return `<div class="shop-row soldout" data-act="soldout" data-i="${i}"><span>${it.name}</span><span class="sp">품절</span></div>`;
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
        player.gold = r.gold; player.inventory = r.inv; soldOut.add(soldKey(shopLevel, i)); sfx.pickup(); toast(`구매 — ${it.name}`);
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

function renderTrain() {
  const list = activeSkills(player.cls, player.spec);
  const books = countOf(player.bag, "skillBook");
  const rows = list.map((sk, i) => {
    const lv = levelOf(player.skillLv, sk.id), cost = upgradeCost(lv);
    const now = scaledSkill(sk, lv), nxt = cost ? scaledSkill(sk, lv + 1) : null;
    const eff = (s: typeof sk) => [s.mul ? `피해 ×${+s.mul.toFixed(2)}` : "", s.heal ? `회복 ${Math.round(s.heal * 100)}%` : "", s.atkMul && s.atkMul > 1 ? `공격력 +${Math.round((s.atkMul - 1) * 100)}%` : "", `대기 ${+s.cooldown.toFixed(1)}초`].filter(Boolean).join(" · ");
    const info = cost ? `비급 ${books}/${cost.books} · ◆ ${cost.gold}` : "최대";
    return `<div class="shop-row" data-i="${i}" style="border-color:${sk.color}"><span><b style="color:${sk.color}">${sk.name}</b> Lv${lv}<br><span class="craft-need">${eff(now)}${nxt ? ` → ${eff(nxt)}` : ""}</span></span><span class="sp">${info}</span></div>`;
  });
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">수련 · 불씨 비급 ${books} · ◆ ${player.gold}</span></div>
    <div class="shop-h">불씨 비급과 골드로 스킬을 수련한다. 최대 Lv${SL.maxLevel}: 효과 증가, 재사용 대기 감소.</div>
    <div class="shop-cols" style="grid-template-columns:1fr">${rows.join("") || '<div class="shop-empty">클래스를 먼저 고르자</div>'}</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((el) => {
    el.addEventListener("click", () => {
      const sk = list[Number(el.dataset.i)];
      const r = upgradeSkill(player.skillLv, sk.id, player.bag, player.gold);
      if (!r.ok) return toast(r.reason === "max" ? "이미 최대 수련이다" : r.reason === "books" ? "불씨 비급이 부족하다" : "골드가 부족하다");
      player.skillLv = r.lv; player.bag = r.bag; player.gold = r.gold;
      sfx.levelUp(); toast(`${sk.name} Lv${r.lv[sk.id]}!`);
      saveGame(); renderTrain();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { trainMode = false; render(); });
}

function renderClass() {
  const cost = classChangeCost(player.lv.level);
  const rows = CLASS_IDS.filter((id) => id !== player.cls).map((id, i) => {
    const c = classDef(id), armed = pendingClass === id;
    return `<div class="shop-row" data-id="${id}" style="border-color:${c.color}${armed ? ";background:#3a2a1a" : ""}"><span><b style="color:${c.color}">${c.name}</b><br><span class="craft-need">${c.desc ?? ""}</span></span><span class="sp">${armed ? "다시 누르면 확정" : `◆ ${cost}`}</span></div>`;
  });
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">클래스 변경 · 현재 ${player.cls ? classDef(player.cls).name : "없음"} · ◆ ${player.gold}</span></div>
    <div class="shop-h">장비·레벨·투자한 능력치는 그대로, 시작 능력치와 스킬 4개가 바뀐다. 수련한 스킬 단계는 클래스를 되돌리면 돌아온다.</div>
    <div class="shop-cols" style="grid-template-columns:1fr">${rows.join("")}</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id as ClassId;
      if (pendingClass !== id) { pendingClass = id; return renderClass(); }
      if (!player.cls) return;
      if (player.gold < cost) { pendingClass = null; toast("골드가 부족하다"); return renderClass(); }
      player.gold -= cost;
      player.attrs = changeClassAttrs(player.attrs, player.cls, id);
      pendingClass = null;
      setClass(id, false);
      sfx.levelUp(); toast(`${classDef(id).name}(으)로 변경!`);
      saveGame(); renderCharPanel();
      classMode = false; render();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { classMode = false; pendingClass = null; render(); });
}

function renderSpec() {
  const lv = player.lv.level;
  const rows = specsFor(player.cls).map((id) => {
    const d = specDef(id), cur = player.spec === id;
    const sk = d.skills.map((s) => s.name).join(" · ");
    return `<div class="shop-row" data-id="${id}" style="border-color:${cur ? "#ffb347" : "#4a5160"}"><span><b>${d.name}</b>${cur ? " (현재)" : ""}<br><span class="craft-need">${d.desc}<br>스킬: ${sk}</span></span><span class="sp">${cur ? "선택됨" : `◆ ${SPEC_COST}`}</span></div>`;
  });
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">전문화 · Lv${lv}/${SPEC_MIN_LEVEL} · ◆ ${player.gold}</span></div>
    <div class="shop-h">${lv < SPEC_MIN_LEVEL ? `레벨 ${SPEC_MIN_LEVEL}부터 전문화할 수 있다.` : "전문화는 능력치 보너스와 스킬 2개 교체를 준다. 나중에 다시 고를 수 있지만 매번 비용이 든다."}</div>
    <div class="shop-cols" style="grid-template-columns:1fr">${rows.join("") || '<div class="shop-empty">클래스를 먼저 고르자</div>'}</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id as SpecId;
      const r = trySpecialize(player.lv.level, player.gold, player.cls, player.spec, id);
      if (!r.ok) return toast(r.reason === "level" ? `레벨 ${SPEC_MIN_LEVEL}부터 가능하다` : r.reason === "gold" ? "골드가 부족하다" : r.reason === "same" ? "이미 선택한 전문화다" : "선택할 수 없다");
      player.gold = r.gold; player.spec = r.spec;
      applyDerived(false);
      sfx.levelUp(); toast(`${specDef(id).name} 전문화!`);
      saveGame(); renderCharPanel(); renderSpec();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { specMode = false; render(); });
}

function renderBoard() {
  const st = player.bounty, bp = progressOf(st, player.bag);
  let body = "";
  if (st.active) {
    const a = st.active;
    body = `<div class="shop-row" data-act="turnin" style="border-color:${bp?.ready ? "#7dff9a" : "#4a5160"}"><span><b>${a.name}</b><br><span class="craft-need">${a.text} · 진행 ${bp!.cur}/${bp!.goal}</span></span><span class="sp">${bp?.ready ? "보고하기" : `◆ ${a.gold} · 경험치 ${a.exp}${a.skillBook ? " · 비급 1" : ""}`}</span></div>
      <div class="shop-row" data-act="abandon" style="border-color:#4a5160"><span>의뢰 포기 (진행도 사라짐)</span><span class="sp"></span></div>`;
  } else {
    body = makeOffers(st.seed, player.lv.level).map((o, i) => `<div class="shop-row" data-act="accept" data-i="${i}" style="border-color:#ffb347"><span><b>${o.name}</b><br><span class="craft-need">${o.text}</span></span><span class="sp">◆ ${o.gold} · 경험치 ${o.exp}${o.skillBook ? " · 비급 1" : ""}</span></div>`).join("");
  }
  $("dialog").innerHTML = `<div class="dn">${current!.def.name} <span class="dr">의뢰 게시판 · 완료 ${st.done}회</span></div>
    <div class="shop-h">${st.active ? "진행 중인 의뢰" : "하나를 골라 수락한다. 완료하면 새 의뢰가 올라온다."}</div>
    <div class="shop-cols" style="grid-template-columns:1fr">${body}</div>
    <div class="db"><button data-act="back">돌아가기 <kbd>Esc</kbd></button></div>`;
  $("dialog").querySelectorAll<HTMLElement>(".shop-row").forEach((el) => {
    el.addEventListener("click", () => {
      const act = el.dataset.act;
      if (act === "accept") { player.bounty = acceptBounty(player.bounty, makeOffers(st.seed, player.lv.level)[Number(el.dataset.i)]); toast("의뢰 수락!"); }
      else if (act === "abandon") { player.bounty = abandon(player.bounty); toast("의뢰를 포기했다"); }
      else if (act === "turnin") {
        const r = bountyTurnIn(player.bounty, player.bag);
        if (!r.ok) return toast("아직 목표를 채우지 못했다");
        player.bounty = r.state; player.bag = r.bag; player.gold += r.gold;
        if (r.skillBook) player.bag = bagAdd(player.bag, "skillBook", r.skillBook).bag;
        grantRewards({ exp: r.exp });
        sfx.levelUp(); toast(`의뢰 완료! ◆ +${r.gold} · 경험치 +${r.exp}${r.skillBook ? " · 비급 +1" : ""}`);
        renderCharPanel();
      }
      renderQuestLog(); saveGame(); renderBoard();
    });
  });
  $("dialog").querySelector<HTMLElement>('[data-act="back"]')!.addEventListener("click", () => { boardMode = false; render(); });
}

function render() {
  if (!current) return;
  if (specMode) return renderSpec();
  if (boardMode) return renderBoard();
  if (classMode) return renderClass();
  if (trainMode) return renderTrain();
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
    <div class="db">${current.def.id === "merchant" ? `<button data-act="shop">거래</button>` : ""}${current.def.id === "captain" ? `<button data-act="board">의뢰 게시판</button>` : ""}${current.def.id === "priest" ? `<button data-act="train">수련</button><button data-act="spec">전문화</button><button data-act="class">클래스 변경</button>` : ""}${current.def.id === "smith" ? `<button data-act="enh">강화</button><button data-act="craft">제작</button>` : ""}<button data-act="primary">${primary} <kbd>F</kbd></button>${d.kind === "offer" ? `<button data-act="close">다음에 <kbd>Esc</kbd></button>` : ""}</div>`;
  $("dialog").querySelectorAll<HTMLElement>("button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.act === "shop") { shopMode = true; shopLevel = player.lv.level; render(); }
      else if (b.dataset.act === "enh") { enhMode = true; render(); }
      else if (b.dataset.act === "craft") { craftMode = true; render(); }
      else if (b.dataset.act === "train") { trainMode = true; render(); }
      else if (b.dataset.act === "spec") { specMode = true; render(); }
      else if (b.dataset.act === "board") { boardMode = true; render(); }
      else if (b.dataset.act === "class") { classMode = true; pendingClass = null; render(); }
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
// 빠른이동: 밝힌 봉화 곁에서 T. NPC 없이 같은 대화창을 쓴다.
export function openTravel() {
  const here = nearBeacon(4);
  if (!here || !here.lit) return toast("밝혀진 봉화 곁에서만 이동할 수 있다");
  const list = () => travelTargets(beacons.map((b) => ({ id: b.def.id, name: b.def.name, x: b.pos.x, z: b.pos.z, lit: b.lit })), here.def.id, player.gold);
  const draw = () => {
    const t = list();
    $("dialog").innerHTML = `<div class="dn">${here.def.name} <span class="dr">빠른이동 · 보유 ◆ ${player.gold}</span></div>
      <div class="shop-cols"><div style="grid-column:1 / -1">${t.length ? t.map((x) => `<div class="shop-row${x.affordable ? "" : " soldout"}" data-id="${x.id}"><span>${x.name}</span><span class="sp">◆ ${x.cost}</span></div>`).join("") : `<div class="dt">이동할 수 있는 다른 봉화가 없다. 봉화를 더 밝혀라.</div>`}</div></div>
      <div class="hint">Esc 닫기</div>`;
    $("dialog").querySelectorAll<HTMLElement>(".shop-row[data-id]").forEach((row) => row.addEventListener("click", () => {
      const x = list().find((y) => y.id === row.dataset.id);
      const dest = beacons.find((b) => b.def.id === row.dataset.id);
      if (!x || !dest) return;
      if (!x.affordable) return toast("골드가 부족하다");
      player.gold -= x.cost;
      player.pos.set(dest.pos.x + 2, 0, dest.pos.z + 2);
      player.respawnBeacon = dest.def.id;
      sfx.ignite(); toast(`${dest.def.name}(으)로 이동 — ◆${x.cost}`);
      saveGame(); closeDialog();
    }));
  };
  $("dialog").classList.add("open");
  draw();
}
export function closeDialog() {
  current = null;
  shopMode = false;
  enhMode = false;
  craftMode = false;
  trainMode = false;
  classMode = false;
  specMode = false;
  boardMode = false;
  pendingClass = null;
  $("dialog").classList.remove("open");
}
export function dialogPrimary() {
  if (!current) return;
  if (shopMode || enhMode || craftMode || trainMode || classMode || specMode || boardMode) { shopMode = enhMode = craftMode = trainMode = classMode = specMode = boardMode = false; pendingClass = null; render(); return; }
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
