import { describe, it, expect } from "vitest";
import { makeSkillState, gainEmber, tickSkills, castBlock, spendCast, skillsFor, noBuff, applyBuff, tickBuff, EMBER, SKILLS } from "../src/logic/skills";
import { CLASS_IDS } from "../src/logic/classes";

describe("skills data", () => {
  it("클래스마다 스킬 4개, id 중복 없음, 비용은 게이지 이내", () => {
    const ids = new Set<string>();
    for (const c of CLASS_IDS) {
      expect(SKILLS[c]).toHaveLength(4);
      for (const s of SKILLS[c]) {
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
        expect(s.cost).toBeGreaterThan(0);
        expect(s.cost).toBeLessThanOrEqual(EMBER.max);
        expect(s.cooldown).toBeGreaterThan(0);
      }
    }
    expect(skillsFor(null)).toEqual([]);
  });
  it("타입별 필수 값이 있다", () => {
    for (const c of CLASS_IDS) for (const s of SKILLS[c]) {
      if (s.type === "arc" || s.type === "ring") { expect(s.mul).toBeGreaterThan(0); expect(s.range).toBeGreaterThan(0); }
      if (s.type === "arc") expect(s.arcDeg).toBeGreaterThan(0);
      if (s.type === "dash") { expect(s.dist).toBeGreaterThan(0); expect(s.time).toBeGreaterThan(0); }
      if (s.type === "buff") expect((s.duration ?? 0) > 0 || (s.heal ?? 0) > 0).toBe(true);
    }
  });
});

describe("잔불 게이지·쿨타임", () => {
  const sk = skillsFor("vanguard");
  it("게이지는 최대치에서 멈춘다", () => {
    const s = makeSkillState();
    gainEmber(s, 999);
    expect(s.ember).toBe(EMBER.max);
  });
  it("게이지 부족/쿨타임 중에는 시전 불가", () => {
    const s = makeSkillState();
    expect(castBlock(s, 0, sk)).toBe("ember");
    gainEmber(s, 100);
    expect(spendCast(s, 0, sk)).toBe(true);
    expect(s.ember).toBe(100 - sk[0].cost);
    expect(castBlock(s, 0, sk)).toBe("cooldown");
    expect(spendCast(s, 0, sk)).toBe(false);
    expect(s.ember).toBe(100 - sk[0].cost); // 실패하면 소모 없음
    tickSkills(s, sk[0].cooldown);
    expect(castBlock(s, 0, sk)).toBe("none");
  });
  it("없는 슬롯은 시전 불가", () => {
    const s = makeSkillState();
    gainEmber(s, 100);
    expect(spendCast(s, 7, sk)).toBe(false);
    expect(castBlock(s, 7, sk)).toBe("none");
  });
  it("전투가 없으면 게이지가 줄고, 얻는 순간 지연이 초기화된다", () => {
    const s = makeSkillState();
    gainEmber(s, 50);
    tickSkills(s, EMBER.idleBeforeDecay - 0.5);
    expect(s.ember).toBe(50);
    tickSkills(s, 3);
    expect(s.ember).toBeLessThan(50);
    gainEmber(s, 1);
    const e = s.ember;
    tickSkills(s, 1);
    expect(s.ember).toBe(e);
  });
});

describe("버프", () => {
  it("지속시간 동안만 적용되고 끝나면 초기화", () => {
    const b = noBuff();
    applyBuff(b, SKILLS.vanguard[3]);
    expect(b.atkMul).toBeCloseTo(1.35);
    tickBuff(b, 7.9);
    expect(b.t).toBeGreaterThan(0);
    tickBuff(b, 0.2);
    expect(b).toEqual({ atkMul: 1, crit: 0, t: 0 });
  });
  it("지속 0인 스킬(회복 전용)은 버프를 걸지 않는다", () => {
    const b = noBuff();
    applyBuff(b, SKILLS.igniter[2]);
    expect(b.t).toBe(0);
  });
});
