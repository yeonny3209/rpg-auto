// 레벨·경험치 로직. Three.js를 import하지 않는다.
import cfg from "../../data/progression.json";

export interface ProgressionConfig {
  maxLevel: number;
  expBase: number;
  expExponent: number;
  statPointsPerLevel: number;
  hpPerLevel: number;
  staminaPerLevel: number;
}

export const defaultProgression: ProgressionConfig = cfg;

/** level → level+1 에 필요한 경험치. 최대 레벨이면 Infinity. */
export function expToNext(level: number, c: ProgressionConfig = defaultProgression): number {
  if (level >= c.maxLevel) return Infinity;
  return Math.round(c.expBase * Math.pow(level, c.expExponent));
}

export interface LevelState {
  level: number;
  exp: number; // 현재 레벨 안에서 모은 경험치
  statPoints: number;
}

export interface GainResult {
  state: LevelState;
  levelsGained: number;
}

/** 경험치를 더하고, 여러 번 레벨업도 처리한다. 원본은 바꾸지 않는다. */
export function gainExp(s: LevelState, amount: number, c: ProgressionConfig = defaultProgression): GainResult {
  if (amount < 0) throw new Error("amount must be >= 0");
  let { level, exp, statPoints } = s;
  exp += amount;
  let gained = 0;
  while (level < c.maxLevel && exp >= expToNext(level, c)) {
    exp -= expToNext(level, c);
    level++;
    gained++;
    statPoints += c.statPointsPerLevel;
  }
  if (level >= c.maxLevel) exp = 0;
  return { state: { level, exp, statPoints }, levelsGained: gained };
}

export function maxHpAt(level: number, baseHp: number, c: ProgressionConfig = defaultProgression): number {
  return baseHp + (level - 1) * c.hpPerLevel;
}
