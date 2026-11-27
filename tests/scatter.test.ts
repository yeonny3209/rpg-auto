import { describe, it, expect } from "vitest";
import { scatterSpots, clearZones, SCATTER } from "../src/logic/scatter";
import { seededRng } from "../src/logic/shop";
import npcs from "../data/npcs.json";

describe("소품 배치", () => {
  it("같은 시드면 같은 배치(결정론)", () => {
    expect(scatterSpots(seededRng(5), 30)).toEqual(scatterSpots(seededRng(5), 30));
    expect(scatterSpots(seededRng(5), 30)).not.toEqual(scatterSpots(seededRng(6), 30));
  });
  it("요청한 개수를 채우고 반경 범위 안에 있다", () => {
    const s = scatterSpots(seededRng(1), SCATTER.rocks);
    expect(s.length).toBe(SCATTER.rocks);
    for (const p of s) { const r = Math.hypot(p.x, p.z); expect(r).toBeGreaterThanOrEqual(SCATTER.minR - 1e-6); expect(r).toBeLessThanOrEqual(SCATTER.maxR + 1e-6); }
  });
  it("봉화·보스 자리·마을 구역을 침범하지 않는다", () => {
    const zones = clearZones();
    expect(zones.length).toBeGreaterThanOrEqual(5 + 2 + 1);
    for (const seed of [1, 2, 3, 4, 5]) for (const p of scatterSpots(seededRng(seed), 60)) for (const z of zones) expect(Math.hypot(p.x - z.x, p.z - z.z)).toBeGreaterThanOrEqual(z.r);
  });
  it("서로 최소 간격을 지키고 NPC 자리와도 겹치지 않는다", () => {
    const s = scatterSpots(seededRng(9), 70);
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) expect(Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z)).toBeGreaterThanOrEqual(SCATTER.spacing - 1e-6);
    for (const n of npcs.npcs) for (const p of s) expect(Math.hypot(p.x - n.x, p.z - n.z)).toBeGreaterThan(SCATTER.clear.npc);
  });
  it("이미 있는 점을 피한다", () => {
    const taken = [{ x: 20, z: 0 }];
    for (const p of scatterSpots(seededRng(2), 80, taken)) expect(Math.hypot(p.x - 20, p.z)).toBeGreaterThanOrEqual(SCATTER.spacing);
  });
});
