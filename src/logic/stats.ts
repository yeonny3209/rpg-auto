// 레벨 + 속성 포인트 → 최종 능력치
import cfg from "../../data/progression.json";

export type AttrKey = "str" | "agi" | "wis" | "vit";
export const ATTR_KEYS: AttrKey[] = ["str", "agi", "wis", "vit"];
export type Attrs = Record<AttrKey, number>;
export const emptyAttrs = (): Attrs => ({ str: 0, agi: 0, wis: 0, vit: 0 });

export interface Derived {
  maxHp: number;
  maxStamina: number;
  atk: number;
  def: number;
  critChance: number;
  dodgeCostMul: number;
  skillPower: number;
}

export function derive(level: number, a: Attrs, c = cfg): Derived {
  const A = c.attributes;
  const L = level - 1;
  return {
    maxHp: c.base.hp + L * c.hpPerLevel + a.vit * A.vit.hp + a.str * A.str.hp,
    maxStamina: c.base.stamina + L * c.staminaPerLevel + a.agi * A.agi.stamina,
    atk: c.base.atk + L * c.atkPerLevel + a.str * A.str.atk,
    def: c.base.def + a.vit * A.vit.def,
    critChance: 0.1 + a.agi * A.agi.crit,
    dodgeCostMul: Math.max(c.minDodgeCostRatio, 1 - a.agi * A.agi.dodgeCost),
    skillPower: 1 + a.wis * A.wis.skillPower,
  };
}

/** 포인트 1개를 key에 배분. 포인트가 없으면 그대로 반환(null). */
export function allocate(a: Attrs, points: number, key: AttrKey): { attrs: Attrs; points: number } | null {
  if (points <= 0 || !ATTR_KEYS.includes(key)) return null;
  return { attrs: { ...a, [key]: a[key] + 1 }, points: points - 1 };
}
