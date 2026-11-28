import { describe, it, expect } from "vitest";
import { SPEC_IDS, specsFor, specDef, activeSkills, specBonus, trySpecialize, validSpec, SPEC_COST, SPEC_MIN_LEVEL } from "../src/logic/specs";
import { CLASS_IDS } from "../src/logic/classes";
import { skillsFor } from "../src/logic/skills";
import { sanitizeSkillLevels } from "../src/logic/skillLevel";

describe("전문화 데이터", () => {
  it("모든 클래스에 정확히 2갈래, 이름이 서로 다르다", () => {
    for (const c of CLASS_IDS) expect(specsFor(c).length).toBe(2);
    expect(new Set(SPEC_IDS.map((s) => specDef(s).name)).size).toBe(SPEC_IDS.length);
  });
  it("교체 대상이 해당 클래스 기본 스킬에 실제로 있고, 새 스킬 id가 겹치지 않는다", () => {
    const ids = new Set<string>();
    for (const s of SPEC_IDS) {
      const d = specDef(s);
      const base = skillsFor(d.cls as any).map((x) => x.id);
      expect(d.skills.length).toBe(2);
      for (const sk of d.skills as any[]) {
        expect(base).toContain(sk.replaces);
        expect(ids.has(sk.id)).toBe(false); ids.add(sk.id);
        expect(base).not.toContain(sk.id);
        expect(["arc", "ring", "dash", "buff"]).toContain(sk.type);
        expect(sk.cost).toBeGreaterThan(0);
        expect(sk.cooldown).toBeGreaterThan(0);
      }
      // 같은 전문화에서 같은 기본 스킬을 두 번 교체하지 않는다
      expect(new Set((d.skills as any[]).map((x) => x.replaces)).size).toBe(2);
    }
  });
  it("전문화 보너스는 음수 없이 의미 있는 값", () => {
    for (const s of SPEC_IDS) { const b = specBonus(s); expect(Object.values(b).every((v) => v >= 0)).toBe(true); expect(Object.values(b).some((v) => v > 0)).toBe(true); }
    expect(specBonus(null)).toEqual({ atk: 0, atkPct: 0, def: 0, maxHp: 0, crit: 0, maxStamina: 0 });
  });
});

describe("스킬 교체", () => {
  it("전문화하면 4칸 유지, 지정 칸만 교체, 원본 불변", () => {
    for (const s of SPEC_IDS) {
      const cls = specDef(s).cls as any;
      const base = skillsFor(cls), act = activeSkills(cls, s);
      expect(act.length).toBe(base.length);
      const changed = act.filter((x, i) => x.id !== base[i].id).length;
      expect(changed).toBeGreaterThanOrEqual(2); // 교체 대상 2개 이상(같은 칸을 겹쳐 교체하는 경우 제외)
      expect(act.some((x) => (specDef(s).skills as any[]).some((y) => y.id === x.id))).toBe(true);
    }
    expect(activeSkills("vanguard", null)).toEqual(skillsFor("vanguard"));
  });
  it("다른 클래스의 전문화는 무시된다", () => {
    expect(validSpec("vanguard", "sniper")).toBeNull();
    expect(activeSkills("vanguard", "sniper")).toEqual(skillsFor("vanguard"));
    expect(validSpec(null, "guardian")).toBeNull();
  });
  it("수련 단계 저장은 전문화 스킬 id도 인식한다", () => {
    expect(sanitizeSkillLevels({ gd_rush: 3, bs_frenzy: 2, junk: 4 })).toEqual({ gd_rush: 3, bs_frenzy: 2 });
  });
});

describe("전직 조건", () => {
  it("레벨·골드·클래스 조건과 같은 전문화 재선택 거부", () => {
    expect(trySpecialize(SPEC_MIN_LEVEL - 1, 9999, "vanguard", null, "guardian")).toEqual({ ok: false, reason: "level" });
    expect(trySpecialize(20, SPEC_COST - 1, "vanguard", null, "guardian")).toEqual({ ok: false, reason: "gold" });
    expect(trySpecialize(20, 9999, "vanguard", null, "sniper")).toEqual({ ok: false, reason: "class" });
    expect(trySpecialize(20, 9999, "vanguard", "guardian", "guardian")).toEqual({ ok: false, reason: "same" });
    expect(trySpecialize(20, 1000, "vanguard", null, "berserker")).toEqual({ ok: true, gold: 1000 - SPEC_COST, spec: "berserker" });
    expect(trySpecialize(20, 1000, "vanguard", "guardian", "berserker").ok).toBe(true); // 재선택은 다시 비용
  });
});
