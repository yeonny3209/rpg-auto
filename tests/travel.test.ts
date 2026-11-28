import { describe, it, expect } from "vitest";
import { travelCost, travelTargets, TRAVEL_MIN_COST } from "../src/logic/travel";

const B = [
  { id: "a", name: "A", x: 0, z: 0, lit: true },
  { id: "b", name: "B", x: 40, z: 0, lit: true },
  { id: "c", name: "C", x: 170, z: 0, lit: true },
  { id: "d", name: "D", x: 10, z: 10, lit: false },
];
describe("빠른이동", () => {
  it("비용은 거리에 비례하고 최소 비용이 있다", () => {
    expect(travelCost(0, 0, 1, 1)).toBe(TRAVEL_MIN_COST);
    expect(travelCost(0, 0, 100, 0)).toBeGreaterThan(travelCost(0, 0, 40, 0));
  });
  it("꺼진 봉화와 출발 봉화 자신은 목록에서 빠지고 가까운 순이다", () => {
    const t = travelTargets(B, "a", 1000);
    expect(t.map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("출발 봉화가 꺼져 있거나 없으면 이동할 수 없다", () => {
    expect(travelTargets(B, "d", 1000)).toEqual([]);
    expect(travelTargets(B, "zzz", 1000)).toEqual([]);
  });
  it("골드가 모자라면 affordable이 false", () => {
    const t = travelTargets(B, "a", 20);
    expect(t.find((x) => x.id === "c")!.affordable).toBe(false);
    expect(t.find((x) => x.id === "b")!.affordable).toBe(true);
  });
});
