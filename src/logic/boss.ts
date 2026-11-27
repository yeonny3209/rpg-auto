// 보스 패턴 선택·페이즈 (렌더링 무관). 수치는 data/bosses.json.
import cfg from "../../data/bosses.json";

export type BossId = keyof typeof cfg;
export type PatternId = "charge" | "slam" | "spit";
export type Phase = 1 | 2;
export const BOSSES = cfg;
export const bossCfg = (id: BossId) => cfg[id];

export const phaseOf = (hp: number, max: number, id: BossId): Phase => (hp / max <= cfg[id].phase2At ? 2 : 1);

type PatternCfg = (typeof cfg)[BossId]["patterns"][PatternId];
export interface PatternParams { windup: number; weight: number; count?: number; radius?: number; spread?: number; mul: number }
export function patternParams(id: BossId, p: PatternId, phase: Phase): PatternParams {
  const c = cfg[id].patterns[p] as unknown as Record<string, any>;
  const k = String(phase);
  return {
    windup: c.windup[k], weight: c.weight, mul: c.mul,
    count: c.count?.[k], radius: c.radius?.[k], spread: c.spread,
  };
}
export const cooldownFor = (id: BossId, phase: Phase) => (cfg[id].cooldown as Record<string, number>)[String(phase)];

/** 다음 패턴: 가중치 무작위, 직전과 같은 패턴은 피한다. 멀면 돌진·투척 위주, 가까우면 내려찍기 위주. */
export function nextPattern(id: BossId, prev: PatternId | null, dist: number, r: number): PatternId {
  const ids = Object.keys(cfg[id].patterns) as PatternId[];
  const w = ids.map((p) => {
    let x = cfg[id].patterns[p].weight as number;
    if (p === prev) x = 0;
    if (p === "slam") x *= dist < 6 ? 3 : 0.3;
    if (p === "charge" && dist < 3) x *= 0.3;
    if (p === "spit" && dist < 4) x *= 0.3;
    return x;
  });
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return ids[0];
  let x = Math.min(0.999999, Math.max(0, r)) * total;
  for (let i = 0; i < ids.length; i++) { if (x < w[i]) return ids[i]; x -= w[i]; }
  return ids[ids.length - 1];
}

/** 부채꼴로 퍼지는 투사체 각도 목록 (정면 기준, 라디안) */
export function fanAngles(count: number, spread: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => (i / (count - 1) - 0.5) * spread * 2);
}

/** 내려찍기 범위 안인가 (평면 거리) */
export const inSlam = (dist: number, radius: number, playerRadius = 0.4) => dist <= radius + playerRadius;
