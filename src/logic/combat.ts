// 피해 계산. 난수는 주입 가능(테스트 재현성).

export type Rng = () => number;

export interface DamageInput {
  atk: number;
  def: number;
  skillMul?: number; // 기본 1
  critChance?: number; // 0~1
  critMul?: number; // 기본 1.5
  staggered?: boolean; // 그로기 상태면 1.5배
}

export interface DamageResult {
  amount: number;
  crit: boolean;
}

export function computeDamage(i: DamageInput, rng: Rng = Math.random): DamageResult {
  const skillMul = i.skillMul ?? 1;
  const crit = rng() < (i.critChance ?? 0);
  const critMul = crit ? i.critMul ?? 1.5 : 1;
  const stagger = i.staggered ? 1.5 : 1;
  const variance = 0.9 + rng() * 0.2;
  const mitigation = 100 / (100 + Math.max(0, i.def));
  const raw = i.atk * skillMul * mitigation * critMul * stagger * variance;
  return { amount: Math.max(1, Math.round(raw)), crit };
}

/** [min,max] 정수 범위 골드 굴림 */
export function rollRange([min, max]: [number, number], rng: Rng = Math.random): number {
  return min + Math.floor(rng() * (max - min + 1));
}
