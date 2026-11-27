// 상점: 가격·재고·거래 (렌더링 무관). 수치는 data/shop.json.
import cfg from "../../data/shop.json";
import { generateItem, type Item, type RarityId } from "./items";
import type { Rng } from "./combat";
import { enhanceCost, plusOf } from "./enhance";

export const SHOP = cfg;

/** 매입가(플레이어가 살 때). 등급 기본가 × 종류 보정 × (1 + 아이템레벨×계수), 5 단위 반올림 */
export function buyPrice(item: Pick<Item, "rarity" | "kind" | "ilvl">): number {
  const base = cfg.basePrice[item.rarity] ?? cfg.basePrice.common;
  const kind = (cfg.kindMul as Record<string, number>)[item.kind] ?? 1;
  const raw = base * kind * (1 + cfg.perItemLevel * (Math.max(1, item.ilvl) - 1));
  return Math.max(5, Math.round(raw / 5) * 5);
}
/** 강화에 쓴 골드 합계 (+0→+plus) */
function enhanceSpent(item: Pick<Item, "rarity" | "ilvl" | "plus">): number {
  let sum = 0;
  for (let p = 0; p < plusOf(item); p++) sum += enhanceCost({ ...item, plus: p });
  return sum;
}
/** 판매가: (매입가 + 강화에 쓴 골드)의 일정 비율(항상 매입가보다 낮아 재판매 차익이 없다) */
export const sellPrice = (item: Pick<Item, "rarity" | "kind" | "ilvl" | "plus">): number => Math.max(1, Math.floor((buyPrice(item) + enhanceSpent(item)) * cfg.sellRatio));

/** 간단한 시드 난수 (같은 시드 → 같은 재고) */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 플레이어 레벨에 맞춘 상점 재고. 같은 레벨이면 항상 같은 물건(uid 제외) */
export function makeStock(level: number): Item[] {
  const rng = seededRng(level * 9973 + 17);
  const items: Item[] = [];
  for (const s of cfg.stock as { rarity: RarityId; minLevel?: number }[]) {
    if ((s.minLevel ?? 1) > level) continue;
    const it = generateItem(rng, Math.max(1, level), { rarity: s.rarity });
    // uid는 시드 기반으로 고정해서 재고가 안정적이게(구매 표시·테스트용)
    items.push({ ...it, uid: `shop-${level}-${items.length}` });
  }
  return items;
}

export type BuyResult = { ok: true; gold: number; inv: Item[] } | { ok: false; reason: "gold" | "full" };
export function tryBuy(gold: number, inv: Item[], item: Item, invMax: number): BuyResult {
  const price = buyPrice(item);
  if (gold < price) return { ok: false, reason: "gold" };
  if (inv.length >= invMax) return { ok: false, reason: "full" };
  // 구매한 물건은 새 uid로 (재고의 고정 uid와 분리)
  return { ok: true, gold: gold - price, inv: [...inv, { ...item, uid: `${item.uid}-${inv.length}-${Math.floor(gold)}` }] };
}

export type SellResult = { ok: true; gold: number; inv: Item[]; price: number } | { ok: false };
export function trySell(gold: number, inv: Item[], idx: number): SellResult {
  const item = inv[idx];
  if (!item) return { ok: false };
  const price = sellPrice(item);
  return { ok: true, gold: gold + price, inv: inv.filter((_, i) => i !== idx), price };
}
