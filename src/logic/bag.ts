// 겹쳐 쌓이는 물건(소모품·재료). 장비 인벤토리와 별개. 수치는 data/materials.json.
import data from "../../data/materials.json";

export type MatId = keyof typeof data;
export type Bag = Partial<Record<MatId, number>>;
export const MAT_IDS = Object.keys(data) as MatId[];
export const MATS = data;
export const isMatId = (x: unknown): x is MatId => typeof x === "string" && x in data;
export const countOf = (bag: Bag, id: MatId) => bag[id] ?? 0;

/** 최대치까지만 담는다. 실제로 담긴 수량을 함께 돌려준다 */
export function bagAdd(bag: Bag, id: MatId, n: number): { bag: Bag; added: number } {
  const cur = countOf(bag, id);
  const added = Math.max(0, Math.min(n, data[id].max - cur));
  return { bag: added ? { ...bag, [id]: cur + added } : bag, added };
}
/** 충분하면 차감, 모자라면 null */
export function bagTake(bag: Bag, id: MatId, n: number): Bag | null {
  const cur = countOf(bag, id);
  if (cur < n) return null;
  const next = { ...bag, [id]: cur - n };
  if (next[id] === 0) delete next[id];
  return next;
}
export function sanitizeBag(raw: unknown): Bag {
  const out: Bag = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isMatId(k) || typeof v !== "number" || !Number.isFinite(v)) continue;
    const n = Math.min(data[k].max, Math.floor(v));
    if (n > 0) out[k] = n;
  }
  return out;
}

/** 물약 사용: 체력이 가득이거나 없거나 쿨타임이면 불가 */
export type PotionResult = { ok: true; hp: number; bag: Bag; healed: number } | { ok: false; reason: "none" | "full" | "cooldown" };
export function usePotion(hp: number, maxHp: number, bag: Bag, cooldownLeft: number): PotionResult {
  if (cooldownLeft > 0) return { ok: false, reason: "cooldown" };
  if (hp >= maxHp) return { ok: false, reason: "full" };
  const next = bagTake(bag, "potion", 1);
  if (!next) return { ok: false, reason: "none" };
  const hp2 = Math.min(maxHp, hp + Math.round(maxHp * data.potion.healPct));
  return { ok: true, hp: hp2, bag: next, healed: hp2 - hp };
}

/** 적 처치 시 재료·물약 드롭 굴림 */
export interface MatDrop { id: MatId; n: number }
export function rollMatDrops(rng: () => number, enemy: { level: number; ai: string; embers?: number }): MatDrop[] {
  const out: MatDrop[] = [];
  const boss = enemy.ai === "boss";
  if (rng() < (boss ? 1 : 0.3)) out.push({ id: "ashLump", n: boss ? 4 + Math.floor(rng() * 3) : 1 + (rng() < 0.25 ? 1 : 0) });
  if (rng() < (boss ? 0 : 0.1)) out.push({ id: "potion", n: 1 });
  if (boss) out.push({ id: "emberCore", n: 1 + (rng() < 0.5 ? 1 : 0) });
  else if (enemy.level >= 3 && rng() < 0.04) out.push({ id: "emberCore", n: 1 });
  return out;
}
