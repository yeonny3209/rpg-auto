// 잔불 게이지 + 스킬 쿨타임 + 버프 (렌더링 무관). 수치는 data/skills.json.
import cfg from "../../data/skills.json";
import type { ClassId } from "./classes";

export type SkillType = "arc" | "ring" | "dash" | "buff";
export interface SkillDef {
  id: string; name: string; desc: string; type: SkillType; cost: number; cooldown: number; color: string;
  mul?: number; range?: number; arcDeg?: number; poise?: number; critAdd?: number;
  dist?: number; time?: number; invuln?: number;
  atkMul?: number; crit?: number; duration?: number; heal?: number;
}
export const EMBER = cfg.ember;
export const CAST_LOCK = cfg.castLock;
export const SKILLS = cfg.skills as Record<ClassId, SkillDef[]>;
export const skillsFor = (id: ClassId | null): SkillDef[] => (id ? SKILLS[id] ?? [] : []);

export interface SkillState { ember: number; idle: number; cds: number[] }
export const makeSkillState = (): SkillState => ({ ember: 0, idle: 0, cds: [0, 0, 0, 0] });

export function gainEmber(s: SkillState, amount: number): void {
  s.ember = Math.min(EMBER.max, s.ember + amount);
  s.idle = 0;
}

/** 시간 경과: 쿨타임 감소, 일정 시간 전투가 없으면 게이지가 서서히 줄어든다 */
export function tickSkills(s: SkillState, dt: number): void {
  for (let i = 0; i < s.cds.length; i++) s.cds[i] = Math.max(0, s.cds[i] - dt);
  s.idle += dt;
  if (s.idle > EMBER.idleBeforeDecay) s.ember = Math.max(0, s.ember - EMBER.decayPerSec * dt);
}

export type CastBlock = "none" | "cooldown" | "ember";
export function castBlock(s: SkillState, slot: number, skills: SkillDef[]): CastBlock {
  const sk = skills[slot];
  if (!sk) return "none";
  if (s.cds[slot] > 0) return "cooldown";
  if (s.ember < sk.cost) return "ember";
  return "none";
}
/** 가능하면 게이지를 소모하고 쿨타임을 건다. 시전 가능 여부 반환. */
export function spendCast(s: SkillState, slot: number, skills: SkillDef[]): boolean {
  const sk = skills[slot];
  if (!sk || castBlock(s, slot, skills) !== "none") return false;
  s.ember -= sk.cost;
  s.cds[slot] = sk.cooldown;
  s.idle = 0; // 스킬을 쓰는 동안은 전투 중
  return true;
}

export interface Buff { atkMul: number; crit: number; t: number }
export const noBuff = (): Buff => ({ atkMul: 1, crit: 0, t: 0 });
export function applyBuff(b: Buff, sk: SkillDef): void {
  if ((sk.duration ?? 0) <= 0) return;
  b.atkMul = sk.atkMul ?? 1; b.crit = sk.crit ?? 0; b.t = sk.duration!;
}
export function tickBuff(b: Buff, dt: number): void {
  if (b.t <= 0) return;
  b.t = Math.max(0, b.t - dt);
  if (b.t === 0) { b.atkMul = 1; b.crit = 0; }
}
