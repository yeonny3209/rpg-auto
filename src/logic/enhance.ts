// 장비 강화 +0~+10. 실패해도 단계는 내려가지 않고 골드만 잃는다(친절한 규칙). 수치는 data/enhance.json.
import cfg from "../../data/enhance.json";
import type { Item, Stats, StatKey } from "./items";
import type { Rng } from "./combat";

export const ENH = cfg;
export const plusOf = (it: Pick<Item, "plus">) => it.plus ?? 0;

/** 다음 강화 비용(골드). 등급 기본 × (1+아이템레벨×계수) × 성장^현재단계 */
export function enhanceCost(it: Pick<Item, "rarity" | "ilvl" | "plus">): number {
  const base = (cfg.rarityCost as Record<string, number>)[it.rarity] ?? cfg.rarityCost.common;
  return Math.max(5, Math.round((base * (1 + cfg.levelCost * (it.ilvl - 1)) * Math.pow(cfg.costGrowth, plusOf(it))) / 5) * 5);
}
export const canEnhance = (it: Pick<Item, "plus">) => plusOf(it) < cfg.maxPlus;
export const successChanceOf = (it: Pick<Item, "plus">) => cfg.successChance[plusOf(it)] ?? 0;

const FMT_INT: StatKey[] = ["atk", "def", "maxHp", "maxStamina"];
/** +plus 단계의 실제 스탯: 기본 스탯 × (1 + step×plus) */
export function statsAt(base: Stats, plus: number): Stats {
  const out: Stats = {};
  for (const [k, v] of Object.entries(base) as [StatKey, number][]) {
    const raw = v * (1 + cfg.statStep * plus);
    out[k] = FMT_INT.includes(k) ? Math.round(raw) : Math.round(raw * 1000) / 1000;
  }
  return out;
}
/** 해당 단계로 만든 아이템(원본은 그대로) */
export function withPlus(it: Item, plus: number): Item {
  const base = it.base ?? it.stats;
  const p = Math.min(cfg.maxPlus, Math.max(0, Math.floor(plus)));
  if (p === 0) { const { plus: _p, base: _b, ...rest } = it; return { ...rest, stats: base }; }
  return { ...it, base, plus: p, stats: statsAt(base, p) };
}

export type EnhanceResult =
  | { ok: true; gold: number; item: Item; success: boolean; cost: number }
  | { ok: false; reason: "max" | "gold" };
/** 강화 시도. 성공이면 +1, 실패면 골드만 소모 */
export function tryEnhance(gold: number, it: Item, rng: Rng): EnhanceResult {
  if (!canEnhance(it)) return { ok: false, reason: "max" };
  const cost = enhanceCost(it);
  if (gold < cost) return { ok: false, reason: "gold" };
  const success = rng() < successChanceOf(it);
  return { ok: true, gold: gold - cost, item: success ? withPlus(it, plusOf(it) + 1) : it, success, cost };
}
