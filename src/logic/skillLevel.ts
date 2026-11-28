// 스킬 수련: 레벨 1~5. 레벨당 효과 +12%, 재사용 대기 -4%. 비용은 비급 + 골드. 수치는 data/skillLevels.json.
import cfg from "../../data/skillLevels.json";
import specsData from "../../data/specs.json";
import { SKILLS, type SkillDef } from "./skills";
import { bagTake, countOf, type Bag } from "./bag";
import type { ClassId } from "./classes";

export const SL = cfg;
export type SkillLevels = Record<string, number>;
export const levelOf = (lv: SkillLevels, id: string) => Math.min(cfg.maxLevel, Math.max(1, lv[id] ?? 1));

/** 수련 단계가 반영된 스킬(원본 불변). 효과 수치(mul·회복·버프 증가량)는 커지고 쿨타임은 줄어든다. */
export function scaledSkill(sk: SkillDef, level: number): SkillDef {
  const k = 1 + cfg.effectPerLevel * (level - 1);
  const out: SkillDef = { ...sk, cooldown: Math.round(sk.cooldown * (1 - cfg.cooldownPerLevel * (level - 1)) * 100) / 100 };
  if (sk.mul !== undefined) out.mul = Math.round(sk.mul * k * 1000) / 1000;
  if (sk.heal) out.heal = Math.round(sk.heal * k * 1000) / 1000;
  if (sk.atkMul !== undefined && sk.atkMul > 1) out.atkMul = Math.round((1 + (sk.atkMul - 1) * k) * 1000) / 1000;
  if (sk.crit) out.crit = Math.round(sk.crit * k * 1000) / 1000;
  return out;
}
export const scaledList = (list: SkillDef[], lv: SkillLevels): SkillDef[] => list.map((s) => scaledSkill(s, levelOf(lv, s.id)));

/** 다음 단계 비용(최대면 null) */
export function upgradeCost(level: number): { books: number; gold: number } | null {
  if (level >= cfg.maxLevel) return null;
  return { books: cfg.booksPerLevel[level - 1], gold: cfg.goldPerLevel[level - 1] };
}

export type UpgradeResult = { ok: true; lv: SkillLevels; bag: Bag; gold: number } | { ok: false; reason: "max" | "books" | "gold" | "unknown" };
export function upgradeSkill(lv: SkillLevels, id: string, bag: Bag, gold: number): UpgradeResult {
  if (!knownSkill(id)) return { ok: false, reason: "unknown" };
  const cur = levelOf(lv, id), cost = upgradeCost(cur);
  if (!cost) return { ok: false, reason: "max" };
  if (countOf(bag, "skillBook") < cost.books) return { ok: false, reason: "books" };
  if (gold < cost.gold) return { ok: false, reason: "gold" };
  return { ok: true, lv: { ...lv, [id]: cur + 1 }, bag: bagTake(bag, "skillBook", cost.books)!, gold: gold - cost.gold };
}

export function sanitizeSkillLevels(raw: unknown, cls?: ClassId | null): SkillLevels {
  const known = new Set([...Object.values(SKILLS).flat().map((s) => s.id), ...Object.values(specsData.specs).flatMap((sp) => sp.skills.map((s) => s.id))]);
  const out: SkillLevels = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(k) || typeof v !== "number" || !Number.isFinite(v)) continue;
    const n = Math.min(cfg.maxLevel, Math.floor(v));
    if (n >= 2) out[k] = n;
  }
  return out;
}

function knownSkill(id: string): boolean {
  return Object.values(SKILLS).some((l) => l.some((s) => s.id === id)) || Object.values(specsData.specs).some((sp) => sp.skills.some((s) => s.id === id));
}
