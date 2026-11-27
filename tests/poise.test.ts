import { describe, it, expect } from "vitest";
import { makePoise, hitPoise, tickPoise, isStaggered, heavyMultipliers } from "../src/logic/poise";

const c = { max: 40, regenPerSec: 10, regenDelay: 1, staggerTime: 2 };

describe("poise", () => {
  it("0이 되면 그로기, 시간이 지나면 풀리고 완전 회복", () => {
    const p = makePoise(c);
    expect(hitPoise(p, 25, c)).toBe(false);
    expect(hitPoise(p, 25, c)).toBe(true);
    expect(isStaggered(p)).toBe(true);
    expect(hitPoise(p, 25, c)).toBe(false); // 그로기 중 추가 경직 없음
    tickPoise(p, 2.1, c);
    expect(isStaggered(p)).toBe(false);
    expect(p.value).toBe(40);
  });
  it("맞지 않으면 지연 후 회복", () => {
    const p = makePoise(c);
    hitPoise(p, 20, c);
    tickPoise(p, 0.5, c);
    expect(p.value).toBe(20);
    tickPoise(p, 1, c);
    expect(p.value).toBeCloseTo(30);
  });
  it("강공격 차지 배율", () => {
    const h = { minMul: 1, maxMul: 2.2, minPoise: 15, maxPoise: 50 };
    expect(heavyMultipliers(0, h)).toEqual({ dmgMul: 1, poiseDmg: 15 });
    expect(heavyMultipliers(5, h).dmgMul).toBeCloseTo(2.2);
    expect(heavyMultipliers(0.5, h).poiseDmg).toBeCloseTo(32.5);
  });
});
