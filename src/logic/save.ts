// 저장 데이터 직렬화/검증/마이그레이션. localStorage 접근은 게임 쪽에서 한다.
import { ATTR_KEYS, type Attrs } from "./stats";
import { SLOT_IDS, type Equipment, type Item } from "./items";
import type { EmberState, Trace } from "./embers";

export const SAVE_VERSION = 3;

export interface SaveData {
  version: number;
  level: number;
  exp: number;
  statPoints: number;
  attrs: Attrs;
  gold: number;
  inventory: Item[];
  equipment: Equipment;
  embers: EmberState;
  litBeacons: string[];
  respawnBeacon: string;
  trace: Trace | null;
  savedAt: number;
}

export function serialize(d: Omit<SaveData, "version" | "savedAt">, now = Date.now()): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now, ...d });
}

const isNum = (v: unknown, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min;
const isItem = (it: any): it is Item =>
  it && typeof it.uid === "string" && typeof it.baseId === "string" && typeof it.name === "string" && typeof it.kind === "string" &&
  typeof it.rarity === "string" && isNum(it.ilvl, 1) && it.stats && typeof it.stats === "object" && Array.isArray(it.affixes) &&
  Object.values(it.stats).every((v) => isNum(v));

/** 이전 버전 → 현재 버전 */
function migrate(o: any): any {
  if (o.version === 1) o = { ...o, version: 2, inventory: [], equipment: {} };
  if (o.version === 2) o = { ...o, version: 3, embers: { held: 0, banked: 0 }, litBeacons: [], respawnBeacon: "lastLight", trace: null };
  return o;
}

/** 잘못되거나 알 수 없는 버전이면 null. */
export function deserialize(raw: string | null, maxLevel = 40, invCap = 30): SaveData | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  o = migrate(o);
  if (o.version !== SAVE_VERSION) return null;
  if (!isNum(o.level, 1) || o.level > maxLevel || !Number.isInteger(o.level)) return null;
  if (!isNum(o.exp) || !isNum(o.statPoints) || !isNum(o.gold)) return null;
  if (!o.attrs || !ATTR_KEYS.every((k) => isNum(o.attrs[k]))) return null;
  if (!Array.isArray(o.inventory) || !o.equipment || typeof o.equipment !== "object") return null;
  const inventory = o.inventory.filter(isItem).slice(0, invCap);
  const equipment: Equipment = {};
  for (const s of SLOT_IDS) if (isItem(o.equipment[s])) equipment[s] = o.equipment[s];
  if (!o.embers || !isNum(o.embers.held) || !isNum(o.embers.banked)) return null;
  const litBeacons = Array.isArray(o.litBeacons) ? o.litBeacons.filter((b: unknown) => typeof b === "string") : [];
  const respawnBeacon = typeof o.respawnBeacon === "string" ? o.respawnBeacon : "lastLight";
  const t = o.trace;
  const trace: Trace | null = t && typeof t.x === "number" && typeof t.z === "number" && isNum(t.amount, 1) ? { x: t.x, z: t.z, amount: Math.floor(t.amount) } : null;
  const attrs = Object.fromEntries(ATTR_KEYS.map((k) => [k, Math.floor(o.attrs[k])])) as Attrs;
  return {
    version: SAVE_VERSION, level: o.level, exp: o.exp, statPoints: Math.floor(o.statPoints), attrs, gold: Math.floor(o.gold),
    inventory, equipment, embers: { held: Math.floor(o.embers.held), banked: Math.floor(o.embers.banked) }, litBeacons, respawnBeacon, trace,
    savedAt: isNum(o.savedAt) ? o.savedAt : 0,
  };
}
