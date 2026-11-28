import { describe, it, expect } from "vitest";
import { REGIONS, BRIDGE, regionById, walkable, clampWalkable, regionAt, pointInRegion, weightsFor } from "../src/logic/regions";
import enemies from "../data/enemies.json";
import world from "../data/world.json";
const mulberry32 = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe("regions", () => {
  it("지역 중심은 이동 가능, 통로 중간도 가능, 사이 공터 밖은 불가", () => {
    for (const r of REGIONS) expect(walkable(r.x, r.z)).toBe(true);
    const a = regionById(BRIDGE.from), b = regionById(BRIDGE.to);
    expect(walkable((a.x + b.x) / 2, 0)).toBe(true);
    expect(walkable((a.x + b.x) / 2, BRIDGE.halfWidth + 5)).toBe(false);
  });
  it("clampWalkable은 항상 이동 가능한 점을 돌려준다", () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const p = clampWalkable((rng() - 0.3) * 500, (rng() - 0.5) * 300);
      expect(walkable(p.x, p.z)).toBe(true);
    }
    expect(clampWalkable(0, 0)).toEqual({ x: 0, z: 0 });
  });
  it("지역 판정", () => {
    expect(regionAt(0, 0).id).toBe("ashenPlains");
    expect(regionAt(170, 10).id).toBe("sunkenForest");
    expect(regionAt(110, 0).id).toBe("sunkenForest"); // 통로는 더 가까운 지역 쪽
  });
  it("지역 안 무작위 점은 그 지역 안에 있다", () => {
    const rng = mulberry32(9);
    for (const r of REGIONS) for (let i = 0; i < 100; i++) {
      const p = pointInRegion(r, rng);
      expect(Math.hypot(p.x - r.x, p.z - r.z)).toBeLessThanOrEqual(r.r);
    }
  });
  it("지역 적 목록은 모두 실제 적이고 보스가 아니며 가중치가 양수", () => {
    for (const r of REGIONS) {
      for (const id of r.enemies) {
        const e = (enemies as any)[id];
        expect(e, id).toBeTruthy();
        expect(e.ai).not.toBe("boss");
      }
      const w = weightsFor(r.id, enemies as any);
      expect(Object.values(w).every((v) => v > 0)).toBe(true);
    }
  });
  it("두 번째 지역 적은 첫 지역보다 강하다", () => {
    const lv = (r: string) => Math.min(...regionById(r).enemies.map((id) => (enemies as any)[id].level));
    expect(lv("sunkenForest")).toBeGreaterThan(Math.max(...regionById("ashenPlains").enemies.map((id) => (enemies as any)[id].level)));
  });
  it("모든 봉화는 이동 가능한 곳에 있다", () => {
    for (const b of world.beacons) expect(walkable(b.x, b.z), b.id).toBe(true);
  });
});
