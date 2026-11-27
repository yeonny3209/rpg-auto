import { describe, it, expect } from "vitest";
import { derive, allocate, emptyAttrs } from "../src/logic/stats";
import { serialize, deserialize, SAVE_VERSION } from "../src/logic/save";

describe("stats", () => {
  it("레벨 1, 배분 없음 = 기본값", () => {
    const d = derive(1, emptyAttrs());
    expect(d.maxHp).toBe(100);
    expect(d.atk).toBe(12);
    expect(d.def).toBe(5);
    expect(d.maxStamina).toBe(100);
    expect(d.dodgeCostMul).toBe(1);
  });
  it("속성 효과", () => {
    const d = derive(3, { str: 2, agi: 10, wis: 1, vit: 3 });
    expect(d.maxHp).toBe(100 + 2 * 8 + 3 * 10 + 2 * 3);
    expect(d.atk).toBe(12 + 2 + 4);
    expect(d.def).toBe(8);
    expect(d.critChance).toBeCloseTo(0.16);
    expect(d.dodgeCostMul).toBeCloseTo(0.9);
    expect(d.skillPower).toBeCloseTo(1.03);
  });
  it("회피 비용은 50% 아래로 내려가지 않음", () => {
    expect(derive(1, { ...emptyAttrs(), agi: 999 }).dodgeCostMul).toBe(0.5);
  });
  it("포인트 배분", () => {
    const r = allocate(emptyAttrs(), 2, "str")!;
    expect(r.attrs.str).toBe(1);
    expect(r.points).toBe(1);
    expect(allocate(emptyAttrs(), 0, "str")).toBeNull();
  });
});

describe("save", () => {
  const data = { level: 5, exp: 12, statPoints: 3, attrs: { str: 4, agi: 2, wis: 0, vit: 3 }, gold: 99, inventory: [], equipment: {}, embers: { held: 0, banked: 0 }, litBeacons: [], respawnBeacon: "lastLight", trace: null };
  it("왕복", () => {
    const s = deserialize(serialize(data, 123))!;
    expect(s).toEqual({ ...data, version: SAVE_VERSION, savedAt: 123 });
  });
  it("손상·다른 버전·이상한 값 거부", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize("{oops")).toBeNull();
    expect(deserialize(JSON.stringify({ ...data, version: 999 }))).toBeNull();
    expect(deserialize(serialize({ ...data, level: 0 }))).toBeNull();
    expect(deserialize(serialize({ ...data, level: 41 }))).toBeNull();
    expect(deserialize(serialize({ ...data, gold: -1 }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...JSON.parse(serialize(data)), attrs: { str: 1 } }))).toBeNull();
  });
  it("v1 저장은 빈 인벤토리로 마이그레이션", () => {
    const v1 = JSON.stringify({ version: 1, level: 3, exp: 1, statPoints: 0, attrs: { str: 1, agi: 0, wis: 0, vit: 0 }, gold: 5, savedAt: 1 });
    const s = deserialize(v1)!;
    expect(s.version).toBe(3);
    expect(s.level).toBe(3);
    expect(s.inventory).toEqual([]);
    expect(s.equipment).toEqual({});
  });
  it("장비 보너스가 능력치에 반영", () => {
    const d = derive(1, emptyAttrs(), { atk: 8, atkPct: 0.1, def: 2, maxHp: 20, crit: 0.05, maxStamina: 5 });
    expect(d.atk).toBe(22);
    expect(d.def).toBe(7);
    expect(d.maxHp).toBe(120);
    expect(d.critChance).toBeCloseTo(0.15);
    expect(d.maxStamina).toBe(105);
  });
});
