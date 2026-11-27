import { describe, it, expect } from "vitest";
import { scaledSkill, upgradeCost, upgradeSkill, sanitizeSkillLevels, levelOf, scaledList, SL } from "../src/logic/skillLevel";
import { SKILLS } from "../src/logic/skills";

const all = Object.values(SKILLS).flat();
const cleave = all.find((s) => s.id === "vg_cleave")!;
const resolve = all.find((s) => s.id === "vg_resolve")!;
const mend = all.find((s) => s.id === "ig_mend")!;

describe("스킬 수련", () => {
  it("1레벨은 원본과 같고 레벨이 오를수록 강해진다(원본 불변)", () => {
    expect(scaledSkill(cleave, 1)).toEqual(cleave);
    const l5 = scaledSkill(cleave, SL.maxLevel);
    expect(l5.mul!).toBeCloseTo(cleave.mul! * (1 + SL.effectPerLevel * 4), 2);
    expect(l5.cooldown).toBeLessThan(cleave.cooldown);
    expect(cleave.mul).toBe(2.2);
  });
  it("버프는 증가분만, 회복은 비율로 커진다", () => {
    const b = scaledSkill(resolve, 5);
    expect(b.atkMul!).toBeGreaterThan(resolve.atkMul!);
    expect(b.atkMul! - 1).toBeCloseTo((resolve.atkMul! - 1) * (1 + SL.effectPerLevel * 4), 2);
    expect(scaledSkill(mend, 3).heal!).toBeGreaterThan(mend.heal!);
    expect(scaledSkill(mend, 3).atkMul).toBe(1); // 회복 스킬의 atkMul=1은 그대로
  });
  it("쿨타임은 0 이하로 내려가지 않는다", () => {
    for (const s of all) expect(scaledSkill(s, SL.maxLevel).cooldown).toBeGreaterThan(s.cooldown * 0.7);
  });
  it("비용은 단계가 오를수록 증가, 최대 레벨은 null", () => {
    let pb = 0, pg = 0;
    for (let l = 1; l < SL.maxLevel; l++) { const c = upgradeCost(l)!; expect(c.books).toBeGreaterThan(pb - 1); expect(c.gold).toBeGreaterThan(pg); pb = c.books; pg = c.gold; }
    expect(upgradeCost(SL.maxLevel)).toBeNull();
  });
  it("수련: 비급과 골드를 정확히 소모, 부족·최대·모르는 스킬은 거부", () => {
    const c = upgradeCost(1)!;
    const r = upgradeSkill({}, "vg_cleave", { skillBook: c.books + 1 }, c.gold + 5);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.lv.vg_cleave).toBe(2); expect(r.bag.skillBook).toBe(1); expect(r.gold).toBe(5); }
    expect(upgradeSkill({}, "vg_cleave", {}, 9999)).toEqual({ ok: false, reason: "books" });
    expect(upgradeSkill({}, "vg_cleave", { skillBook: 9 }, 0)).toEqual({ ok: false, reason: "gold" });
    expect(upgradeSkill({ vg_cleave: 5 }, "vg_cleave", { skillBook: 9 }, 9999)).toEqual({ ok: false, reason: "max" });
    expect(upgradeSkill({}, "nope", { skillBook: 9 }, 9999)).toEqual({ ok: false, reason: "unknown" });
  });
  it("저장 정리: 모르는 스킬·1 이하·초과·비숫자 제거", () => {
    expect(sanitizeSkillLevels({ vg_cleave: 9, junk: 3, tr_stab: 1, ig_bolt: 2.7, vg_slam: "x" })).toEqual({ vg_cleave: 5, ig_bolt: 2 });
    expect(sanitizeSkillLevels(null)).toEqual({});
    expect(levelOf({ vg_cleave: 99 }, "vg_cleave")).toBe(SL.maxLevel);
    expect(scaledList(SKILLS.vanguard, { vg_cleave: 2 })[0].mul!).toBeGreaterThan(cleave.mul!);
  });
});
