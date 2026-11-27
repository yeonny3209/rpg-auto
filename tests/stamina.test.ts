import { describe, it, expect } from "vitest";
import { makeStamina, spend, regen, canSpend, isInvulnerable } from "../src/logic/stamina";
import { resolveCircle } from "../src/logic/collision";

const cfg = { max: 100, regenPerSec: 50, regenDelay: 0.5 };

describe("stamina", () => {
  it("소모 후 지연이 지나야 회복", () => {
    const s = makeStamina(cfg);
    spend(s, 40);
    regen(s, 0.3, cfg);
    expect(s.value).toBe(60);
    regen(s, 0.3, cfg); // 누적 0.6 > 0.5
    expect(s.value).toBeCloseTo(75);
  });
  it("최대치를 넘지 않음", () => {
    const s = makeStamina(cfg);
    spend(s, 10);
    for (let i = 0; i < 100; i++) regen(s, 0.1, cfg);
    expect(s.value).toBe(100);
  });
  it("남은 양보다 비싸도 0까지 허용, 0이면 불가", () => {
    const s = makeStamina(cfg);
    s.value = 5;
    expect(spend(s, 25)).toBe(true);
    expect(s.value).toBe(0);
    expect(canSpend(s)).toBe(false);
    expect(spend(s, 1)).toBe(false);
  });
  it("무적 프레임 구간", () => {
    expect(isInvulnerable(null, 0.25)).toBe(false);
    expect(isInvulnerable(0.1, 0.25)).toBe(true);
    expect(isInvulnerable(0.3, 0.25)).toBe(false);
  });
});

describe("collision", () => {
  it("장애물 밖으로 밀어냄", () => {
    const p = { x: 0.5, z: 0 };
    expect(resolveCircle(p, 0.5, [{ x: 0, z: 0, r: 1 }])).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.5);
  });
  it("멀면 그대로", () => {
    const p = { x: 5, z: 0 };
    expect(resolveCircle(p, 0.5, [{ x: 0, z: 0, r: 1 }])).toBe(false);
    expect(p.x).toBe(5);
  });
});
