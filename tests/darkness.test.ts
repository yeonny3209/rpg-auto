import { describe, it, expect } from "vitest";
import { darknessAt, damageMulAt, fogFarAt, DARK } from "../src/logic/darkness";
import world from "../data/world.json";

const lit = [{ x: 0, z: 0 }];
describe("어둠", () => {
  it("봉화 가까이는 0, 멀리는 1, 사이는 선형", () => {
    expect(darknessAt(5, 0, lit)).toBe(0);
    expect(darknessAt(DARK.safeRadius, 0, lit)).toBe(0);
    expect(darknessAt(200, 0, lit)).toBe(1);
    const mid = (DARK.safeRadius + DARK.fullRadius) / 2;
    expect(darknessAt(mid, 0, lit)).toBeCloseTo(0.5, 5);
  });
  it("가장 가까운 밝은 봉화 기준, 하나도 없으면 최대", () => {
    expect(darknessAt(40, 0, [{ x: 0, z: 0 }, { x: 40, z: 5 }])).toBe(0);
    expect(darknessAt(0, 0, [])).toBe(1);
  });
  it("피해 배율과 안개 거리가 범위 안에서 단조", () => {
    expect(damageMulAt(0)).toBe(1);
    expect(damageMulAt(1)).toBeCloseTo(DARK.maxDamageMul, 5);
    expect(fogFarAt(0)).toBe(DARK.fogFar);
    expect(fogFarAt(1)).toBe(DARK.fogFarDark);
    expect(fogFarAt(0.5)).toBeLessThan(fogFarAt(0));
  });
  it("초기 상태(마지막 등불만 켜짐)에서 다른 봉화는 모두 어두운 구역에 있다 — 점화가 의미 있다", () => {
    const start = world.beacons.filter((b) => b.litAtStart);
    for (const b of world.beacons.filter((b) => !b.litAtStart)) expect(darknessAt(b.x, b.z, start)).toBeGreaterThan(0.3);
  });
  it("봉화를 밝히면 그 주변은 안전해진다", () => {
    const b = world.beacons.find((b) => !b.litAtStart)!;
    expect(darknessAt(b.x, b.z, [...world.beacons.filter((x) => x.litAtStart), b])).toBe(0);
  });
});
