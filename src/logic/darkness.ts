// 어둠 수치: 밝혀진 봉화에서 멀수록 어두워진다(0~1). 받는 피해가 늘고 시야가 좁아진다.
import cfg from "../../data/world.json";

export const DARK = cfg.darkness;

/** 가장 가까운 밝혀진 봉화까지의 거리 → 어둠 정도(0=안전, 1=가장 어두움). 밝힌 봉화가 없으면 1. */
export function darknessAt(x: number, z: number, lit: { x: number; z: number }[], c = DARK): number {
  if (lit.length === 0) return 1;
  let d = Infinity;
  for (const b of lit) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
  const t = (d - c.safeRadius) / (c.fullRadius - c.safeRadius);
  return Math.min(1, Math.max(0, t));
}
/** 어둠 정도 → 받는 피해 배율 (1 ~ maxDamageMul) */
export const damageMulAt = (dark: number, c = DARK): number => 1 + (c.maxDamageMul - 1) * dark;
/** 어둠 정도 → 안개 끝 거리 */
export const fogFarAt = (dark: number, c = DARK): number => c.fogFar + (c.fogFarDark - c.fogFar) * dark;
