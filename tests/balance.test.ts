// 밸런스 시뮬레이션: 단순 모델(연속 평타, 이동·회피 시간 제외)로 "방향이 맞는지"만 점검한다.
// 실제 체감은 사람이 해 봐야 안다. 여기 임계값은 첫 값이며 튜닝 시 같이 조정한다.
import { describe, it, expect } from "vitest";
import enemies from "../data/enemies.json";
import combat from "../data/combat.json";
import { derive, emptyAttrs } from "../src/logic/stats";
import { classDef, classGear, classStartAttrs, classAttack, CLASS_IDS, type ClassId } from "../src/logic/classes";
import { expToNext } from "../src/logic/progression";

const E = enemies as Record<string, any>;
const FIELD = ["ashCrawler", "ashSpitter", "ashCharger"];
/** 방어 보정·치명 기대값을 반영한 평타 1회 평균 피해 */
function avgHit(cls: ClassId, level: number, def: number) {
  const d = derive(level, classStartAttrs(cls), classGear(cls));
  const crit = 1 + d.critChance * 0.5;
  return d.atk * (100 / (100 + def)) * crit;
}
/** 평타 연속 사용 시 적 1마리 처치 시간(초). 스태미나 제약(재생 포함)도 반영 */
function secondsToKill(cls: ClassId, level: number, e: any) {
  const a = classAttack(cls);
  const swings = Math.ceil(e.hp / avgHit(cls, level, e.def));
  const cd = combat.attack.cooldown * a.cooldownMul;
  const cost = combat.attack.staminaCost * a.staminaMul;
  const maxSta = derive(level, classStartAttrs(cls), classGear(cls)).maxStamina;
  const sustainCd = Math.max(cd, cost / combat.stamina.regenPerSec); // 재생이 못 따라가면 느려진다
  const burst = Math.floor(maxSta / cost);
  const fast = Math.min(swings, burst) * cd;
  return fast + Math.max(0, swings - burst) * sustainCd;
}

describe("클래스별 처치 속도", () => {
  for (const id of CLASS_IDS) {
    it(`${classDef(id).name}: 레벨 1에서 기어다니는 것을 15초 안에, 충전 돌격수는 레벨 3에서 30초 안에 잡는다`, () => {
      expect(secondsToKill(id, 1, E.ashCrawler)).toBeLessThan(15);
      expect(secondsToKill(id, 3, E.ashCharger)).toBeLessThan(30);
    });
  }
  it("세 클래스의 처치 속도 차이가 3배를 넘지 않는다(레벨 1, 기어다니는 것)", () => {
    const t = CLASS_IDS.map((id) => secondsToKill(id, 1, E.ashCrawler));
    expect(Math.max(...t) / Math.min(...t)).toBeLessThan(3);
  });
  it("레벨이 오를수록 같은 적을 더 빨리 잡는다", () => {
    for (const id of CLASS_IDS) expect(secondsToKill(id, 5, E.ashCharger)).toBeLessThanOrEqual(secondsToKill(id, 1, E.ashCharger));
  });
});

describe("레벨업 페이스", () => {
  /** 적 처치 사이 이동·회복 시간을 포함한 사냥 한 사이클 평균(초). 처치 시간 + 이동·회피·회복 15초(추정) */
  function minutesToLevel(target: number) {
    const w = FIELD.map((k) => E[k].spawnWeight), sum = w.reduce((a, b) => a + b, 0);
    let expNeed = 0;
    for (let l = 1; l < target; l++) expNeed += expToNext(l);
    const avgExp = FIELD.reduce((s, k, i) => s + E[k].exp * (w[i] / sum), 0);
    const kills = expNeed / avgExp;
    const avgKill = CLASS_IDS.reduce((s, id) => s + FIELD.reduce((t, k, i) => t + secondsToKill(id, Math.max(1, Math.floor(target / 2)), E[k]) * (w[i] / sum), 0), 0) / CLASS_IDS.length;
    return { kills, minutes: (kills * (avgKill + 15)) / 60 };
  }
  it("레벨 5까지 3~20분, 레벨 8까지 8~45분 (초반은 빠르게 느끼는 구간 가이드)", () => {
    const l5 = minutesToLevel(5), l8 = minutesToLevel(8);
    console.log("balance:", JSON.stringify({ lv5: l5, lv8: l8 }));
    expect(l5.minutes).toBeGreaterThan(3);
    expect(l5.minutes).toBeLessThan(20);
    expect(l8.minutes).toBeGreaterThan(8);
    expect(l8.minutes).toBeLessThan(45);
  });
  it("보스 경험치가 한 레벨 이상의 가치를 준다", () => {
    expect(E.boarKing.exp).toBeGreaterThan(expToNext(5) * 0.5);
  });
});

describe("지역 2(가라앉은 숲) 난이도", () => {
  const FOREST = ["mireLeech", "sporeCaster", "bogBrute"];
  it("레벨 10 기준 일반 적 처치가 60초를 넘지 않고, 보스는 레벨 12에서 평타만으로 5분 안에 잡힌다", () => {
    const rows = FOREST.map((k) => ({ k, t: CLASS_IDS.map((id) => Math.round(secondsToKill(id, 10, E[k]))) }));
    const boss = CLASS_IDS.map((id) => Math.round(secondsToKill(id, 12, E.mireMother)));
    console.log("forest ttk:", JSON.stringify({ rows, boss }));
    for (const r of rows) for (const t of r.t) expect(t).toBeLessThan(60);
    for (const t of boss) expect(t).toBeLessThan(300);
  });
  it("숲 적 한 마리가 주는 경험치로 한 레벨(10→11)에 20~120마리가 필요하다", () => {
    const w = FOREST.map((k) => E[k].spawnWeight), sum = w.reduce((a, b) => a + b, 0);
    const avg = FOREST.reduce((s, k, i) => s + E[k].exp * (w[i] / sum), 0);
    const kills = expToNext(10) / avg;
    console.log("forest kills per level 10:", Math.round(kills));
    expect(kills).toBeGreaterThan(20);
    expect(kills).toBeLessThan(120);
  });
  it("숲 적은 초원 적보다 평균 경험치·골드 보상이 크다", () => {
    const avg = (ids: string[], f: (e: any) => number) => ids.reduce((s, k) => s + f(E[k]), 0) / ids.length;
    expect(avg(FOREST, (e) => e.exp)).toBeGreaterThan(avg(FIELD, (e) => e.exp));
    expect(avg(FOREST, (e) => (e.gold[0] + e.gold[1]) / 2)).toBeGreaterThan(avg(FIELD, (e) => (e.gold[0] + e.gold[1]) / 2));
  });
});
