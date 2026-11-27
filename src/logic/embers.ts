// 잔불: 들고 다니다가 봉화에서 각인하면 영구 강화. 죽으면 일부를 흔적으로 떨어뜨린다.
import w from "../../data/world.json";

export interface EmberState { held: number; banked: number }
export interface Trace { x: number; z: number; amount: number }
export type EmberCfg = typeof w.embers;

/** 사망 처리: 들고 있던 잔불의 lossRatio만큼 흔적으로 떨어뜨림. 기존 흔적은 사라진다(소울류 규칙). */
export function onDeath(s: EmberState, at: { x: number; z: number }, c: EmberCfg = w.embers): { state: EmberState; trace: Trace | null } {
  const lost = Math.floor(s.held * c.deathLossRatio);
  return {
    state: { held: s.held - lost, banked: s.banked },
    trace: lost > 0 ? { x: at.x, z: at.z, amount: lost } : null,
  };
}

export function recoverTrace(s: EmberState, t: Trace): EmberState {
  return { held: s.held + t.amount, banked: s.banked };
}

export function engrave(s: EmberState): EmberState {
  return { held: 0, banked: s.banked + s.held };
}

/** 각인 레벨: 다음 레벨까지 비용이 레벨마다 perLevelCost씩 늘어남 (20, 40, 60 …) */
export function engraveLevel(banked: number, c: EmberCfg = w.embers): number {
  let lvl = 0, cost = c.perLevelCost, left = banked;
  while (left >= cost) { left -= cost; lvl++; cost += c.perLevelCost; }
  return lvl;
}

export function nextLevelProgress(banked: number, c: EmberCfg = w.embers): { into: number; need: number } {
  let cost = c.perLevelCost, left = banked;
  while (left >= cost) { left -= cost; cost += c.perLevelCost; }
  return { into: left, need: cost };
}

export function engraveBonus(banked: number, c: EmberCfg = w.embers) {
  const lvl = engraveLevel(banked, c);
  return { level: lvl, atkPct: lvl * c.atkPctPerLevel, maxHp: lvl * c.hpPerLevel };
}
