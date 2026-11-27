// 저장 데이터 직렬화/검증. localStorage 접근은 게임 쪽에서 한다.
import { ATTR_KEYS, type Attrs } from "./stats";

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  level: number;
  exp: number;
  statPoints: number;
  attrs: Attrs;
  gold: number;
  savedAt: number;
}

export function serialize(d: Omit<SaveData, "version" | "savedAt">, now = Date.now()): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now, ...d });
}

const isNum = (v: unknown, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min;

/** 잘못되거나 다른 버전이면 null. 앞으로 버전이 오르면 여기서 마이그레이션한다. */
export function deserialize(raw: string | null, maxLevel = 40): SaveData | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || o.version !== SAVE_VERSION) return null;
  if (!isNum(o.level, 1) || o.level > maxLevel || !Number.isInteger(o.level)) return null;
  if (!isNum(o.exp) || !isNum(o.statPoints) || !isNum(o.gold)) return null;
  if (!o.attrs || !ATTR_KEYS.every((k) => isNum(o.attrs[k]))) return null;
  const attrs = Object.fromEntries(ATTR_KEYS.map((k) => [k, Math.floor(o.attrs[k])])) as Attrs;
  return { version: SAVE_VERSION, level: o.level, exp: o.exp, statPoints: Math.floor(o.statPoints), attrs, gold: Math.floor(o.gold), savedAt: isNum(o.savedAt) ? o.savedAt : 0 };
}
