import { describe, it, expect } from "vitest";
import { heightAt, roughness, valueNoise } from "../src/logic/terrain";
import w from "../data/world.json";

describe("terrain", () => {
  it("같은 좌표는 항상 같은 높이(결정론)", () => {
    expect(heightAt(23.4, -17.9)).toBe(heightAt(23.4, -17.9));
  });
  it("마을과 모든 봉화 주변은 완전한 평지", () => {
    for (const [dx, dz] of [[0, 0], [3, 4], [-8, 5], [9, -9]]) expect(heightAt(w.terrain.village.x + dx, w.terrain.village.z + dz)).toBe(0);
    for (const b of w.beacons) for (const [dx, dz] of [[0, 0], [2, 1], [-3, 3]]) expect(heightAt(b.x + dx, b.z + dz)).toBeCloseTo(0, 9);
  });
  it("진폭 범위를 넘지 않는다", () => {
    for (let x = -60; x <= 60; x += 3.7) for (let z = -60; z <= 60; z += 3.7) expect(Math.abs(heightAt(x, z))).toBeLessThanOrEqual(w.terrain.amplitude + 1e-9);
  });
  it("멀리서는 실제로 기복이 있다", () => {
    const hs: number[] = [];
    for (let x = -60; x <= 60; x += 2) for (let z = 30; z <= 60; z += 2) hs.push(heightAt(x, z));
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(w.terrain.amplitude * 0.8);
  });
  it("연속적이다: 0.1 이동에 높이 변화가 작다(급경사 없음)", () => {
    let worst = 0;
    for (let x = -50; x <= 50; x += 1.3) for (let z = -50; z <= 50; z += 1.3) worst = Math.max(worst, Math.abs(heightAt(x + 0.1, z) - heightAt(x, z)) / 0.1);
    expect(worst).toBeLessThan(0.5); // 기울기 < 약 27°
  });
  it("평탄화 마스크는 0~1, 노이즈도 0~1", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 7.31) % 100 - 50, z = (i * 3.17) % 100 - 50;
      const m = roughness(x, z), n = valueNoise(x, z, 3);
      expect(m).toBeGreaterThanOrEqual(0); expect(m).toBeLessThanOrEqual(1);
      expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(1);
    }
  });
});
