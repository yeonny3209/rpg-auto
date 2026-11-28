// 15레벨 전문화: 클래스당 2갈래. 능력치 보너스 + 스킬 2개 교체. 수치는 data/specs.json.
import cfg from "../../data/specs.json";
import { skillsFor, type SkillDef } from "./skills";
import type { ClassId } from "./classes";
import type { GearBonus } from "./stats";

export type SpecId = keyof typeof cfg.specs;
export const SPEC_IDS = Object.keys(cfg.specs) as SpecId[];
export const SPEC_MIN_LEVEL = cfg.minLevel;
export const SPEC_COST = cfg.cost;
export const isSpecId = (v: unknown): v is SpecId => typeof v === "string" && Object.prototype.hasOwnProperty.call(cfg.specs, v);
export const specDef = (id: SpecId) => cfg.specs[id];
export const specsFor = (cls: ClassId | null): SpecId[] => (cls ? SPEC_IDS.filter((s) => cfg.specs[s].cls === cls) : []);
/** 클래스에 맞지 않거나 없는 전문화는 null */
export const validSpec = (cls: ClassId | null, spec: unknown): SpecId | null => (isSpecId(spec) && cls && cfg.specs[spec].cls === cls ? spec : null);

export function specBonus(spec: SpecId | null): GearBonus {
  const z: GearBonus = { atk: 0, atkPct: 0, def: 0, maxHp: 0, crit: 0, maxStamina: 0 };
  return spec ? { ...z, ...(cfg.specs[spec].bonus as Partial<GearBonus>) } : z;
}

/** 기본 스킬에서 전문화 스킬로 교체한 목록(슬롯 위치 유지) */
export function activeSkills(cls: ClassId | null, spec: SpecId | null): SkillDef[] {
  const base = skillsFor(cls);
  const sp = validSpec(cls, spec);
  if (!sp) return base;
  const swaps = cfg.specs[sp].skills as (SkillDef & { replaces: string })[];
  return base.map((s) => {
    const sw = swaps.find((x) => x.replaces === s.id);
    if (!sw) return s;
    const { replaces: _r, ...def } = sw;
    return def as SkillDef;
  });
}

export type SpecResult = { ok: true; gold: number; spec: SpecId } | { ok: false; reason: "level" | "gold" | "class" | "same" };
export function trySpecialize(level: number, gold: number, cls: ClassId | null, current: SpecId | null, want: SpecId): SpecResult {
  if (!validSpec(cls, want)) return { ok: false, reason: "class" };
  if (level < SPEC_MIN_LEVEL) return { ok: false, reason: "level" };
  if (current === want) return { ok: false, reason: "same" };
  if (gold < SPEC_COST) return { ok: false, reason: "gold" };
  return { ok: true, gold: gold - SPEC_COST, spec: want };
}
