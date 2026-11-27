// 클래스 데이터 조회 (렌더링 무관). 수치는 data/classes.json.
import cfg from "../../data/classes.json";
import type { Attrs, GearBonus } from "./stats";

export type ClassId = keyof typeof cfg.classes;
export const CLASS_IDS = Object.keys(cfg.classes) as ClassId[];
export const DEFAULT_CLASS: ClassId = "vanguard";

export const isClassId = (v: unknown): v is ClassId => typeof v === "string" && Object.prototype.hasOwnProperty.call(cfg.classes, v);
export const classDef = (id: ClassId) => cfg.classes[id];

export interface ClassAttack { rangeMul: number; arcMul: number; cooldownMul: number; staminaMul: number }
export const NEUTRAL_ATTACK: ClassAttack = { rangeMul: 1, arcMul: 1, cooldownMul: 1, staminaMul: 1 };

/** 클래스 고유 보너스를 장비 보너스와 같은 모양으로 반환 (더하기 쉽게). */
export function classGear(id: ClassId | null): GearBonus {
  const z: GearBonus = { atk: 0, atkPct: 0, def: 0, maxHp: 0, crit: 0, maxStamina: 0 };
  if (!id) return z;
  return { ...z, ...(classDef(id).bonus as Partial<GearBonus>) };
}
export function addGear(a: GearBonus, b: GearBonus): GearBonus {
  return { atk: a.atk + b.atk, atkPct: a.atkPct + b.atkPct, def: a.def + b.def, maxHp: a.maxHp + b.maxHp, crit: a.crit + b.crit, maxStamina: a.maxStamina + b.maxStamina };
}
export const classStartAttrs = (id: ClassId): Attrs => ({ ...classDef(id).startAttrs });
export const classAttack = (id: ClassId | null): ClassAttack => (id ? classDef(id).attack : NEUTRAL_ATTACK);
export const classMoveMul = (id: ClassId | null): number => (id ? classDef(id).moveSpeedMul : 1);

/** 클래스 변경 비용(골드): 레벨에 비례 */
export const classChangeCost = (level: number): number => 100 * Math.max(1, level);

/** 클래스를 바꿀 때의 속성: 이전 클래스의 시작 속성을 빼고 새 클래스의 시작 속성을 더한다(투자한 점수는 그대로, 음수 방지) */
export function changeClassAttrs(attrs: Attrs, from: ClassId, to: ClassId): Attrs {
  const a = classStartAttrs(from), b = classStartAttrs(to);
  const out = { ...attrs };
  for (const k of Object.keys(out) as (keyof Attrs)[]) out[k] = Math.max(0, out[k] - a[k]) + b[k];
  return out;
}
