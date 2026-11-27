import { describe, it, expect } from "vitest";
import { expToNext, gainExp, maxHpAt, defaultProgression } from "../src/logic/progression";
import { computeDamage, rollRange } from "../src/logic/combat";

const fixed = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("progression", () => {
  it("경험치 곡선은 증가한다", () => {
    for (let l = 1; l < 39; l++) expect(expToNext(l + 1)).toBeGreaterThan(expToNext(l));
    expect(expToNext(1)).toBe(20);
  });
  it("최대 레벨이면 Infinity", () => {
    expect(expToNext(defaultProgression.maxLevel)).toBe(Infinity);
  });
  it("한 번에 여러 레벨업 + 스탯 포인트", () => {
    const r = gainExp({ level: 1, exp: 0, statPoints: 0 }, expToNext(1) + expToNext(2) + 5);
    expect(r.state.level).toBe(3);
    expect(r.levelsGained).toBe(2);
    expect(r.state.exp).toBe(5);
    expect(r.state.statPoints).toBe(6);
  });
  it("최대 레벨을 넘지 않는다", () => {
    const r = gainExp({ level: 39, exp: 0, statPoints: 0 }, 1e9);
    expect(r.state.level).toBe(40);
    expect(r.state.exp).toBe(0);
  });
  it("음수 경험치 거부", () => {
    expect(() => gainExp({ level: 1, exp: 0, statPoints: 0 }, -1)).toThrow();
  });
  it("레벨당 HP 증가", () => {
    expect(maxHpAt(1, 100)).toBe(100);
    expect(maxHpAt(5, 100)).toBe(132);
  });
});

describe("combat", () => {
  it("방어력이 피해를 줄인다", () => {
    const a = computeDamage({ atk: 100, def: 0 }, fixed(0.99, 0.5)).amount;
    const b = computeDamage({ atk: 100, def: 100 }, fixed(0.99, 0.5)).amount;
    expect(a).toBe(100);
    expect(b).toBe(50);
  });
  it("치명타와 그로기 배율", () => {
    const r = computeDamage({ atk: 100, def: 0, critChance: 1, staggered: true }, fixed(0, 0.5));
    expect(r.crit).toBe(true);
    expect(r.amount).toBe(225);
  });
  it("최소 피해 1", () => {
    expect(computeDamage({ atk: 0, def: 999 }, fixed(0.99, 0)).amount).toBe(1);
  });
  it("골드 범위 굴림", () => {
    expect(rollRange([1, 4], () => 0)).toBe(1);
    expect(rollRange([1, 4], () => 0.9999)).toBe(4);
  });
});
