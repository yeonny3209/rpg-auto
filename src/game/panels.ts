import { MAT_IDS, MATS } from "../logic/bag";
import { classDef } from "../logic/classes";
import prog from "../../data/progression.json";
import { sfx } from "./sfx";
import { derive, allocate, ATTR_KEYS, type AttrKey } from "../logic/stats";
import { equipFromInventory, unequip, rarityOf, formatStat, itemScore, slotsFor, SLOT_IDS, ITEM_CFG, type Item, type SlotId, type StatKey } from "../logic/items";
import { $, DC, applyDerived, player, saveGame, toast } from "./core";

// ---------- 인벤토리 창 (I) ----------
export function toggleInvPanel() {
  $("invPanel").classList.toggle("open");
  renderInvPanel();
}
export function itemTooltip(it: Item, compare?: Item): string {
  const r = rarityOf(it.rarity);
  const lines = (Object.entries(it.stats) as [StatKey, number][]).map(([k, v]) => {
    let diff = "";
    if (compare) {
      const d = v - (compare.stats[k] ?? 0);
      if (Math.abs(d) > 1e-9) diff = ` <span class="${d > 0 ? "up" : "down"}">(${d > 0 ? "▲" : "▼"})</span>`;
    }
    return `<div>${formatStat(k, v)}${diff}</div>`;
  });
  const slot = slotsFor(it.kind).map((s) => ITEM_CFG.slotNames[s]).join("/");
  return `<div class="tt-name" style="color:${r.color}">${it.plus ? `+${it.plus} ` : ""}${it.name}</div>
    <div class="tt-sub">${r.name} · ${slot} · 아이템 레벨 ${it.ilvl}</div>${lines.join("")}
    ${it.affixes.length ? `<div class="tt-sub">부가옵션 ${it.affixes.length}개 포함</div>` : ""}
    ${compare ? `<div class="tt-sub">착용 중: ${compare.name} (점수 ${Math.round(itemScore(compare))} → ${Math.round(itemScore(it))})</div>` : ""}`;
}
export function renderInvPanel() {
  const el = $("invPanel");
  if (!el.classList.contains("open")) return;
  const eq = player.equipment;
  el.innerHTML = `
    <h3>장비 · 가방 <span class="cap">${player.inventory.length}/${ITEM_CFG.inventorySize}</span></h3>
    <div class="inv-wrap">
      <div class="slots">${SLOT_IDS.map((s) => {
        const it = eq[s];
        return `<div class="slot ${it ? "filled" : ""}" data-slot="${s}" style="${it ? `border-color:${rarityOf(it.rarity).color}` : ""}">
          <span class="sl">${ITEM_CFG.slotNames[s]}</span><span class="sn" style="${it ? `color:${rarityOf(it.rarity).color}` : ""}">${it ? (it.plus ? `+${it.plus} ` : "") + it.name : "—"}</span></div>`;
      }).join("")}</div>
      <div class="grid">${Array.from({ length: ITEM_CFG.inventorySize }, (_, i) => {
        const it = player.inventory[i];
        if (!it) return `<div class="cell"></div>`;
        const c = rarityOf(it.rarity).color;
        return `<div class="cell item" data-i="${i}" style="border-color:${c};box-shadow: inset 0 0 10px ${c}55"><span>${it.name.slice(0, 2)}</span></div>`;
      }).join("")}</div>
    </div>
    <div class="mats">${MAT_IDS.map((id) => `<span class="mat" title="${MATS[id].desc}">${MATS[id].name} <b>${player.bag[id] ?? 0}</b>/${MATS[id].max}</span>`).join("")}</div>
    <div id="tooltip" class="tooltip">아이템에 마우스를 올리면 정보가 보인다. 클릭: 장착 / 장착칸 클릭: 해제</div>
    <div class="hint">I 닫기</div>`;
  const tt = el.querySelector("#tooltip") as HTMLElement;
  el.querySelectorAll<HTMLElement>(".cell.item").forEach((c) => {
    const it = player.inventory[Number(c.dataset.i)];
    // 빈 칸이 있으면 비교 대상 없음, 아니면 교체될 장비와 비교
    const slots = slotsFor(it.kind);
    const cur = slots.some((s) => !player.equipment[s]) ? undefined : player.equipment[slots[0]];
    c.addEventListener("mouseenter", () => (tt.innerHTML = itemTooltip(it, cur)));
    c.addEventListener("click", () => {
      const r = equipFromInventory(player.equipment, player.inventory, Number(c.dataset.i));
      if (!r) return;
      player.equipment = r.eq;
      player.inventory = r.inv;
      applyDerived(false);
      sfx.equip();
      saveGame();
      renderInvPanel();
      renderCharPanel();
    });
  });
  el.querySelectorAll<HTMLElement>(".slot.filled").forEach((c) => {
    const s = c.dataset.slot as SlotId;
    c.addEventListener("mouseenter", () => (tt.innerHTML = itemTooltip(player.equipment[s]!)));
    c.addEventListener("click", () => {
      const r = unequip(player.equipment, player.inventory, s, ITEM_CFG.inventorySize);
      if (!r) return toast("가방이 가득 찼다");
      player.equipment = r.eq;
      player.inventory = r.inv;
      applyDerived(false);
      saveGame();
      renderInvPanel();
      renderCharPanel();
    });
  });
}

// ---------- 캐릭터 창 (C) ----------
export function toggleCharPanel() {
  const el = $("charPanel");
  el.classList.toggle("open");
  renderCharPanel();
}
export function spendPoint(key: AttrKey) {
  const r = allocate(player.attrs, player.lv.statPoints, key);
  if (!r) return;
  player.attrs = r.attrs;
  player.lv = { ...player.lv, statPoints: r.points };
  applyDerived(false);
  saveGame();
  renderCharPanel();
}
export function renderCharPanel() {
  const el = $("charPanel");
  if (!el.classList.contains("open")) return;
  const d = derive(player.lv.level, player.attrs);
  const A = prog.attributes as Record<AttrKey, { name: string; desc: string }>;
  el.innerHTML = `
    <h3>${player.cls ? classDef(player.cls).name : "점화자"} · Lv ${player.lv.level}</h3>
    <div class="pts">남은 포인트: <b>${player.lv.statPoints}</b></div>
    ${ATTR_KEYS.map((k) => `
      <div class="attr"><span class="nm">${A[k].name}</span><span class="val">${player.attrs[k]}</span>
        <button data-k="${k}" ${player.lv.statPoints > 0 ? "" : "disabled"}>+</button>
        <div class="desc">${A[k].desc}</div></div>`).join("")}
    <div class="derived">
      <div>최대 HP <b>${d.maxHp}</b></div><div>공격력 <b>${d.atk}</b></div>
      <div>방어력 <b>${d.def}</b></div><div>스태미나 <b>${d.maxStamina}</b></div>
      <div>치명타 <b>${(d.critChance * 100).toFixed(1)}%</b></div><div>회피 비용 <b>${Math.round(DC.staminaCost * d.dodgeCostMul)}</b></div>
    </div>
    <div class="hint">C 닫기 · 진행 상황은 자동 저장</div>`;
  el.querySelectorAll("button[data-k]").forEach((b) =>
    b.addEventListener("click", (ev) => { ev.stopPropagation(); spendPoint((b as HTMLElement).dataset.k as AttrKey); })
  );
}
