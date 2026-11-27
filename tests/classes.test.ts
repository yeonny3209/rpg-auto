import { describe, it, expect } from "vitest";
import { CLASS_IDS, classGear, addGear, classStartAttrs, classAttack, classMoveMul, isClassId, classDef } from "../src/logic/classes";
import { derive, ATTR_KEYS } from "../src/logic/stats";

describe("classes", () => {
  it("3종: 선봉·추적자·점화술사", () => {
    expect(CLASS_IDS).toEqual(["vanguard", "tracker", "igniter"]);
    expect(CLASS_IDS.map((c) => classDef(c).name)).toEqual(["선봉", "추적자", "점화술사"]);
  });
  it("isClassId는 알 수 없는 값과 프로토타입 키를 거부", () => {
    expect(isClassId("tracker")).toBe(true);
    for (const v of ["warrior", "", null, undefined, 3, "toString", "__proto__"]) expect(isClassId(v)).toBe(false);
  });
  it("시작 속성 포인트 합이 모두 같다(공정성)", () => {
    const sums = CLASS_IDS.map((c) => ATTR_KEYS.reduce((s, k) => s + classStartAttrs(c)[k], 0));
    expect(new Set(sums).size).toBe(1);
  });
  it("클래스 보너스가 능력치에 반영된다", () => {
    const base = derive(1, classStartAttrs("vanguard"));
    const van = derive(1, classStartAttrs("vanguard"), classGear("vanguard"));
    expect(van.maxHp).toBe(base.maxHp + 30);
    expect(van.def).toBe(base.def + 2);
    const trk = derive(1, classStartAttrs("tracker"), classGear("tracker"));
    expect(trk.maxStamina).toBe(100 + 4 * 2 + 25);
    expect(trk.critChance).toBeCloseTo(0.1 + 4 * 0.006 + 0.08);
    expect(trk.maxHp).toBe(100 - 10);
  });
  it("클래스 없음은 중립", () => {
    expect(classGear(null)).toEqual({ atk: 0, atkPct: 0, def: 0, maxHp: 0, crit: 0, maxStamina: 0 });
    expect(classAttack(null).rangeMul).toBe(1);
    expect(classMoveMul(null)).toBe(1);
  });
  it("공격 특성: 추적자는 빠르고 짧고, 점화술사는 좁고 길다", () => {
    const t = classAttack("tracker"), i = classAttack("igniter"), v = classAttack("vanguard");
    expect(t.cooldownMul).toBeLessThan(v.cooldownMul);
    expect(t.rangeMul).toBeLessThan(v.rangeMul);
    expect(i.rangeMul).toBeGreaterThan(v.rangeMul);
    expect(i.arcMul).toBeLessThan(v.arcMul);
    expect(classMoveMul("tracker")).toBeGreaterThan(1);
  });
  it("addGear 합산", () => {
    const g = addGear(classGear("tracker"), { atk: 1, atkPct: 0, def: 0, maxHp: 0, crit: 0.02, maxStamina: 0 });
    expect(g.crit).toBeCloseTo(0.1);
    expect(g.atk).toBe(1);
  });
});

import { changeClassAttrs, classChangeCost, classStartAttrs as startOf } from "../src/logic/classes";
describe("클래스 변경", () => {
  it("투자한 점수는 유지하고 시작 속성만 교체", () => {
    const from = "vanguard" as const, to = "tracker" as const;
    const invested = { ...startOf(from) };
    invested.str += 3; invested.agi += 2;
    const r = changeClassAttrs(invested, from, to);
    const s = startOf(to), f = startOf(from);
    for (const k of Object.keys(r) as (keyof typeof r)[]) expect(r[k]).toBe(s[k] + Math.max(0, invested[k] - f[k]));
  });
  it("왕복하면 원래 값으로 돌아오고 음수는 없다", () => {
    const a = { ...startOf("igniter") }; a.wis += 4;
    const back = changeClassAttrs(changeClassAttrs(a, "igniter", "vanguard"), "vanguard", "igniter");
    expect(back).toEqual(a);
    for (const v of Object.values(changeClassAttrs({ str: 0, agi: 0, wis: 0, vit: 0 }, "vanguard", "tracker"))) expect(v).toBeGreaterThanOrEqual(0);
  });
  it("비용은 레벨에 비례하고 1레벨도 0이 아니다", () => {
    expect(classChangeCost(1)).toBeGreaterThan(0);
    expect(classChangeCost(10)).toBe(classChangeCost(1) * 10);
  });
});
