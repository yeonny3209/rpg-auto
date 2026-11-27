// 포이즈(경직 저항). 0이 되면 그로기 — 일정 시간 행동 불가 + 받는 피해 1.5배.
export interface PoiseConfig { max: number; regenPerSec: number; regenDelay: number; staggerTime: number }
export interface Poise { value: number; sinceHit: number; staggerT: number }

export function makePoise(c: PoiseConfig): Poise {
  return { value: c.max, sinceHit: Infinity, staggerT: 0 };
}

export function isStaggered(p: Poise): boolean {
  return p.staggerT > 0;
}

/** 포이즈 피해를 주고, 이번 타격으로 그로기가 됐으면 true. 이미 그로기면 깎지 않음. */
export function hitPoise(p: Poise, amount: number, c: PoiseConfig): boolean {
  p.sinceHit = 0;
  if (isStaggered(p)) return false;
  p.value -= amount;
  if (p.value <= 0) {
    p.value = 0;
    p.staggerT = c.staggerTime;
    return true;
  }
  return false;
}

export function tickPoise(p: Poise, dt: number, c: PoiseConfig): void {
  if (p.staggerT > 0) {
    p.staggerT = Math.max(0, p.staggerT - dt);
    if (p.staggerT === 0) p.value = c.max; // 그로기가 풀리면 포이즈 완전 회복
    return;
  }
  p.sinceHit += dt;
  if (p.sinceHit >= c.regenDelay) p.value = Math.min(c.max, p.value + c.regenPerSec * dt);
}

/** 차지 비율(0~1)에 따른 강공격 배율 */
export function heavyMultipliers(charge: number, h: { minMul: number; maxMul: number; minPoise: number; maxPoise: number }) {
  const k = Math.min(1, Math.max(0, charge));
  return { dmgMul: h.minMul + (h.maxMul - h.minMul) * k, poiseDmg: h.minPoise + (h.maxPoise - h.minPoise) * k };
}
