import { describe, it, expect } from "vitest";
import { onDeath, recoverTrace, engrave, engraveLevel, engraveBonus, nextLevelProgress } from "../src/logic/embers";
import { serialize, deserialize } from "../src/logic/save";

describe("embers", () => {
  it("사망 시 절반을 흔적으로", () => {
    const r = onDeath({ held: 31, banked: 5 }, { x: 1, z: 2 });
    expect(r.state).toEqual({ held: 16, banked: 5 });
    expect(r.trace).toEqual({ x: 1, z: 2, amount: 15 });
  });
  it("잃을 게 없으면 흔적 없음", () => {
    expect(onDeath({ held: 1, banked: 0 }, { x: 0, z: 0 }).trace).toBeNull();
  });
  it("흔적 회수와 각인", () => {
    let s = recoverTrace({ held: 16, banked: 5 }, { x: 0, z: 0, amount: 15 });
    expect(s.held).toBe(31);
    s = engrave(s);
    expect(s).toEqual({ held: 0, banked: 36 });
  });
  it("각인 레벨은 점점 비싸짐 (20, 40, 60)", () => {
    expect(engraveLevel(19)).toBe(0);
    expect(engraveLevel(20)).toBe(1);
    expect(engraveLevel(59)).toBe(1);
    expect(engraveLevel(60)).toBe(2);
    expect(engraveLevel(120)).toBe(3);
    expect(nextLevelProgress(70)).toEqual({ into: 10, need: 60 });
  });
  it("각인 보너스", () => {
    expect(engraveBonus(60)).toEqual({ level: 2, atkPct: 0.02, maxHp: 6 });
  });
});

describe("save v3", () => {
  const base = { level: 2, exp: 0, statPoints: 0, attrs: { str: 0, agi: 0, wis: 0, vit: 0 }, gold: 0, inventory: [], equipment: {} };
  it("잔불·봉화·흔적 왕복", () => {
    const d = { ...base, embers: { held: 7, banked: 30 }, litBeacons: ["lastLight", "northRuins"], respawnBeacon: "northRuins", trace: { x: 1, z: 2, amount: 3 }, classId: null };
    const s = deserialize(serialize(d))!;
    expect(s.embers).toEqual({ held: 7, banked: 30 });
    expect(s.litBeacons).toEqual(["lastLight", "northRuins"]);
    expect(s.respawnBeacon).toBe("northRuins");
    expect(s.trace).toEqual({ x: 1, z: 2, amount: 3 });
  });
  it("v2 → v3 마이그레이션", () => {
    const v2 = JSON.stringify({ version: 2, savedAt: 0, ...base });
    const s = deserialize(v2)!;
    expect(s.version).toBe(4);
    expect(s.classId).toBe("vanguard"); // 클래스 도입 전 저장은 선봉으로 이어간다
    expect(s.embers).toEqual({ held: 0, banked: 0 });
    expect(s.litBeacons).toEqual([]);
    expect(s.trace).toBeNull();
  });
});
