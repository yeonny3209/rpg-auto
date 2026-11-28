import { walkable } from "../src/logic/regions";
import { describe, it, expect } from "vitest";
import { phaseOf, patternParams, nextPattern, fanAngles, inSlam, cooldownFor, bossCfg } from "../src/logic/boss";
import enemies from "../data/enemies.json";
import { derive } from "../src/logic/stats";

describe("보스 데이터", () => {
  it("보스 정의가 enemies.json에 있고 스폰 가중치는 0(일반 스폰 제외)", () => {
    expect((enemies as any).boarKing.ai).toBe("boss");
    expect((enemies as any).boarKing.spawnWeight).toBe(0);
  });
  it("2페이즈가 더 빠르고 강하다", () => {
    for (const p of ["charge", "slam", "spit"] as const) expect(patternParams("boarKing", p, 2).windup).toBeLessThan(patternParams("boarKing", p, 1).windup);
    expect(cooldownFor("boarKing", 2)).toBeLessThan(cooldownFor("boarKing", 1));
    expect(patternParams("boarKing", "slam", 2).radius!).toBeGreaterThan(patternParams("boarKing", "slam", 1).radius!);
    expect(patternParams("boarKing", "charge", 2).count).toBe(2);
    expect(patternParams("boarKing", "spit", 2).count!).toBeGreaterThan(patternParams("boarKing", "spit", 1).count!);
  });
  it("예고 시간은 사람이 반응할 수 있는 0.5초 이상", () => {
    for (const ph of [1, 2] as const) for (const p of ["charge", "slam", "spit"] as const) expect(patternParams("boarKing", p, ph).windup).toBeGreaterThanOrEqual(0.5);
  });
  it("보스 한 방 피해가 레벨 8 기준 체력의 절반 이하", () => {
    const d = derive(8, { str: 0, agi: 0, wis: 0, vit: 0 });
    const b = (enemies as any).boarKing;
    const hit = Math.max(1, Math.round(b.atk * 1.7 - d.def * 0.5));
    expect(hit).toBeLessThan(d.maxHp * 0.5);
  });
});

describe("페이즈·패턴", () => {
  it("체력 50% 이하에서 2페이즈", () => {
    expect(phaseOf(720, 720, "boarKing")).toBe(1);
    expect(phaseOf(361, 720, "boarKing")).toBe(1);
    expect(phaseOf(360, 720, "boarKing")).toBe(2);
    expect(phaseOf(1, 720, "boarKing")).toBe(2);
  });
  it("같은 패턴을 연속으로 고르지 않는다", () => {
    for (const prev of ["charge", "slam", "spit"] as const)
      for (let i = 0; i < 50; i++) expect(nextPattern("boarKing", prev, 3 + i * 0.2, i / 50)).not.toBe(prev);
  });
  it("가까우면 내려찍기, 멀면 돌진·투척 위주", () => {
    let slamNear = 0, slamFar = 0;
    for (let i = 0; i < 200; i++) {
      if (nextPattern("boarKing", null, 3, i / 200) === "slam") slamNear++;
      if (nextPattern("boarKing", null, 14, i / 200) === "slam") slamFar++;
    }
    expect(slamNear).toBeGreaterThan(slamFar * 2);
  });
  it("모든 패턴이 실제로 나온다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(nextPattern("boarKing", null, 6, i / 300));
    expect(seen.size).toBe(3);
  });
  it("부채꼴 각도는 좌우 대칭, 1발이면 정면", () => {
    expect(fanAngles(1, 0.5)).toEqual([0]);
    const a = fanAngles(5, 0.45);
    expect(a).toHaveLength(5);
    expect(a[0]).toBeCloseTo(-a[4]);
    expect(a[2]).toBeCloseTo(0);
  });
  it("내려찍기 범위 판정", () => {
    expect(inSlam(4.5, 4.2)).toBe(true);
    expect(inSlam(4.7, 4.2)).toBe(false);
  });
  it("홈이 월드 안, 이탈 한계는 양수", () => {
    const c = bossCfg("boarKing");
    expect(walkable(c.home.x, c.home.z), "boarKing home").toBe(true);
    expect(c.leash).toBeGreaterThan(10);
  });
});

import { BOSS_IDS } from "../src/logic/boss";
import worldData from "../data/world.json";
import questsData from "../data/quests.json";

describe("모든 보스 공통 규칙 (미니보스 포함)", () => {
  it("보스마다 적 정의(ai boss·스폰 0)와 패턴이 있고 월드 안에 있다", () => {
    expect(BOSS_IDS).toContain("cinderWarden");
    for (const id of BOSS_IDS) {
      const e = (enemies as any)[id];
      expect(e.ai).toBe("boss");
      expect(e.spawnWeight).toBe(0);
      const c = bossCfg(id);
      expect(walkable(c.home.x, c.home.z), `${id} home`).toBe(true);
      expect(Object.keys(c.patterns).length).toBeGreaterThanOrEqual(2);
      for (const ph of [1, 2] as const) {
        for (const p of Object.keys(c.patterns) as any[]) expect(patternParams(id, p, ph).windup).toBeGreaterThanOrEqual(0.5);
        expect(cooldownFor(id, ph)).toBeGreaterThan(0);
      }
    }
  });
  it("미니보스는 지역 보스보다 약하고 보상도 작다", () => {
    const m = (enemies as any).cinderWarden, k = (enemies as any).boarKing;
    expect(m.hp).toBeLessThan(k.hp);
    expect(m.atk).toBeLessThan(k.atk);
    expect(m.exp).toBeLessThan(k.exp);
    const rank = ["common", "uncommon", "rare", "epic", "legendary"];
    expect(rank.indexOf(bossCfg("cinderWarden").guaranteedRarity)).toBeLessThan(rank.indexOf(bossCfg("boarKing").guaranteedRarity));
  });
  it("미니보스는 북쪽 폐허 봉화 근처, 가시 투사 없이도 같은 패턴 연속 금지", () => {
    const b = worldData.beacons.find((x) => x.id === "northRuins")!;
    const h = bossCfg("cinderWarden").home;
    expect(Math.hypot(h.x - b.x, h.z - b.z)).toBeLessThan(25);
    let prev: any = null;
    for (let i = 0; i < 60; i++) { const n = nextPattern("cinderWarden", prev, 5 + (i % 7), (i * 0.137) % 1); expect(n).not.toBe(prev); expect(["charge", "slam"]).toContain(n); prev = n; }
  });
  it("미니보스 퀘스트의 목표가 실제 적을 가리킨다", () => {
    const qs = (questsData as any).quests ?? questsData;
    const list = Array.isArray(qs) ? qs : Object.values(qs);
    const q = (list as any[]).find((x) => x.id === "side5");
    expect(q).toBeTruthy();
    for (const o of q.objectives) if (o.type === "kill") expect((enemies as any)[o.target]).toBeTruthy();
  });
});
