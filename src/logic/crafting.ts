// 대장장이 제작: 재료 + 골드 → 장비 또는 소모품. 레시피는 data/recipes.json.
import recipes from "../../data/recipes.json";
import { generateItem, type Item, type RarityId, ITEM_CFG } from "./items";
import data from "../../data/items.json";
import { bagAdd, bagTake, countOf, MATS, type Bag, type MatId } from "./bag";
import type { Rng } from "./combat";

export interface Recipe {
  id: string; name: string; needs: Partial<Record<MatId, number>>; gold: number;
  gives: { bag?: Partial<Record<MatId, number>>; item?: { kinds: string[]; rarity: RarityId } };
}
export const RECIPES = recipes as Recipe[];

/** 부족한 재료/골드 목록(비어 있으면 제작 가능) */
export function shortfall(r: Recipe, bag: Bag, gold: number): string[] {
  const lack: string[] = [];
  for (const [id, n] of Object.entries(r.needs) as [MatId, number][]) if (countOf(bag, id) < n) lack.push(`${MATS[id].name} ${n - countOf(bag, id)}개`);
  if (gold < r.gold) lack.push(`골드 ${r.gold - gold}`);
  return lack;
}

export type CraftResult =
  | { ok: true; bag: Bag; gold: number; inv: Item[]; made: string }
  | { ok: false; reason: "lack" | "full" | "bagfull"; lack?: string[] };

export function craft(r: Recipe, bag: Bag, gold: number, inv: Item[], level: number, rng: Rng): CraftResult {
  const lack = shortfall(r, bag, gold);
  if (lack.length) return { ok: false, reason: "lack", lack };
  if (r.gives.item && inv.length >= ITEM_CFG.inventorySize) return { ok: false, reason: "full" };
  let b: Bag | null = bag;
  for (const [id, n] of Object.entries(r.needs) as [MatId, number][]) b = bagTake(b!, id, n);
  if (!b) return { ok: false, reason: "lack" };
  let made = r.name;
  let outInv = inv;
  if (r.gives.bag) {
    for (const [id, n] of Object.entries(r.gives.bag) as [MatId, number][]) {
      const res = bagAdd(b, id, n);
      if (res.added < n) return { ok: false, reason: "bagfull" }; // 가방이 넘치면 재료를 쓰지 않고 거부
      b = res.bag;
    }
  }
  if (r.gives.item) {
    const kind = r.gives.item.kinds[Math.floor(rng() * r.gives.item.kinds.length)];
    const bases = data.bases.filter((x) => x.kind === kind);
    const base = bases[Math.floor(rng() * bases.length)];
    const it = generateItem(rng, Math.max(1, level), { rarity: r.gives.item.rarity, baseId: base.id });
    outInv = [...inv, it];
    made = it.name;
  }
  return { ok: true, bag: b, gold: gold - r.gold, inv: outInv, made };
}
