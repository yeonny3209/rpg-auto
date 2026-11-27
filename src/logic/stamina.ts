// 스태미나: 행동에 소모, 마지막 소모 후 regenDelay초 지나면 회복.
export interface StaminaConfig { max: number; regenPerSec: number; regenDelay: number }
export interface Stamina { value: number; max: number; sinceSpend: number }

export function makeStamina(c: StaminaConfig): Stamina {
  return { value: c.max, max: c.max, sinceSpend: Infinity };
}

/** 스태미나가 조금이라도 남아 있으면 행동 가능(남은 양보다 비싸도 0까지 깎고 허용) — 소울류의 관대한 규칙 */
export function canSpend(s: Stamina): boolean {
  return s.value > 0;
}

export function spend(s: Stamina, cost: number): boolean {
  if (!canSpend(s)) return false;
  s.value = Math.max(0, s.value - cost);
  s.sinceSpend = 0;
  return true;
}

export function regen(s: Stamina, dt: number, c: StaminaConfig): void {
  s.sinceSpend += dt;
  if (s.sinceSpend >= c.regenDelay) s.value = Math.min(s.max, s.value + c.regenPerSec * dt);
}

/** 회피 중 무적 판정: 회피 시작 후 경과 시간이 iframe 이하인가 */
export function isInvulnerable(dodgeElapsed: number | null, iframe: number): boolean {
  return dodgeElapsed !== null && dodgeElapsed >= 0 && dodgeElapsed <= iframe;
}
