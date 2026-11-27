// 아이템 생성·드롭·장착. 렌더링과 무관.
import data from "../../data/items.json";
import { weightedPick } from "./spawn";
import type { Rng } from "./combat";

export type StatKey = "atk" | "atkPct" | "def" | "maxHp" | "crit" | "maxStamina";
export type Stats = Partial<Record<StatKey, number>>;
export type SlotId = "weapon" | "head" | "body" | "hands" | "feet" | "ring1" | "ring2";
export const SLOT_IDS = Object.keys(data.slots) as SlotId[];
export type RarityId = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface Item {
  uid: string;
  baseId: string;
  name: string;
  kind: string; // weapon/head/body/hands/feet/ring
  rarity: RarityId;
  ilvl: number;
  stats: Stats; // 기본 + 부가옵션 합산
  affixes: { id: StatKey; value: number }[];
  plus?: number; // 강화 단계(없으면 0)
  base?: Stats; // 강화 전 스탯(강화된 아이템만)
}

export const RARITIES = data.rarities as { id: RarityId; name: string; color: string; weight: number; affixes: [number, number]; statMul: number }[];
export const rarityOf = (id: RarityId) => RARITIES.find((r) => r.id === id)!;

let uidCounter = 0;
const newUid = (rng: Rng) => `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;

const round = (k: StatKey, v: number) => (k === "atkPct" || k === "crit" ? Math.round(v * 1000) / 1000 : Math.round(v));

/** 희귀도 굴림. luck(0~)이 높을수록 상위 등급 가중치가 커진다. */
export function rollRarity(rng: Rng, luck = 0): RarityId {
  const w = Object.fromEntries(RARITIES.map((r, i) => [r.id, r.weight * (1 + luck * i)])) as Record<RarityId, number>;
  return weightedPick(w, rng());
}

export function generateItem(rng: Rng, ilvl: number, opts: { rarity?: RarityId; baseId?: string } = {}): Item {
  const base = opts.baseId ? data.bases.find((b) => b.id === opts.baseId)! : data.bases[Math.floor(rng() * data.bases.length)];
  const rarity = opts.rarity ?? rollRarity(rng);
  const r = rarityOf(rarity);
  const L = Math.max(1, ilvl) - 1;
  const stats: Stats = {};
  for (const [k, v] of Object.entries(base.stats) as [StatKey, number][]) {
    const per = (base.perLevel as Stats)[k] ?? 0;
    stats[k] = round(k, (v + per * L) * r.statMul);
  }
  const count = r.affixes[0] + Math.floor(rng() * (r.affixes[1] - r.affixes[0] + 1));
  const pool = [...data.affixes];
  const affixes: Item["affixes"] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const a = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const id = a.id as StatKey;
    const value = round(id, a.min + (a.max - a.min) * rng() + a.perLevel * L);
    if (value <= 0) continue;
    affixes.push({ id, value });
    stats[id] = round(id, (stats[id] ?? 0) + value);
  }
  return { uid: newUid(rng), baseId: base.id, name: base.name, kind: base.kind, rarity, ilvl: Math.max(1, ilvl), stats, affixes };
}

/** 적 처치 시 드롭. 없으면 null */
export function rollDrop(rng: Rng, enemyLevel: number, dropChance: number, luck = 0): Item | null {
  if (rng() >= dropChance) return null;
  return generateItem(rng, enemyLevel, { rarity: rollRarity(rng, luck) });
}

export function slotsFor(kind: string): SlotId[] {
  return kind === "ring" ? ["ring1", "ring2"] : SLOT_IDS.includes(kind as SlotId) ? [kind as SlotId] : [];
}

export type Equipment = Partial<Record<SlotId, Item>>;

/** 인벤토리 idx의 아이템을 장착. 기존 장비는 그 자리로 돌아온다. 반지는 빈 칸 우선. */
export function equipFromInventory(eq: Equipment, inv: Item[], idx: number): { eq: Equipment; inv: Item[] } | null {
  const item = inv[idx];
  if (!item) return null;
  const slots = slotsFor(item.kind);
  if (!slots.length) return null;
  const slot = slots.find((s) => !eq[s]) ?? slots[0];
  const newEq = { ...eq, [slot]: item };
  const newInv = inv.slice();
  const prev = eq[slot];
  if (prev) newInv[idx] = prev;
  else newInv.splice(idx, 1);
  return { eq: newEq, inv: newInv };
}

export function unequip(eq: Equipment, inv: Item[], slot: SlotId, capacity: number): { eq: Equipment; inv: Item[] } | null {
  const item = eq[slot];
  if (!item || inv.length >= capacity) return null;
  const newEq = { ...eq };
  delete newEq[slot];
  return { eq: newEq, inv: [...inv, item] };
}

export function equipmentStats(eq: Equipment): Required<Stats> {
  const total: Required<Stats> = { atk: 0, atkPct: 0, def: 0, maxHp: 0, crit: 0, maxStamina: 0 };
  for (const it of Object.values(eq)) if (it) for (const [k, v] of Object.entries(it.stats) as [StatKey, number][]) total[k] += v;
  return total;
}

/** 아이템 점수(대략적 비교용) */
export function itemScore(it: Item): number {
  const s = it.stats;
  return (s.atk ?? 0) * 3 + (s.atkPct ?? 0) * 200 + (s.def ?? 0) * 2 + (s.maxHp ?? 0) * 0.4 + (s.crit ?? 0) * 300 + (s.maxStamina ?? 0) * 0.5;
}

export function formatStat(k: StatKey, v: number): string {
  const a = data.affixes.find((x) => x.id === k)!;
  return a.fmt === "pct" ? `${a.name} +${(v * 100).toFixed(1)}%` : `${a.name} +${v}`;
}

export const ITEM_CFG = { inventorySize: data.inventorySize, slotNames: data.slots as Record<SlotId, string> };
