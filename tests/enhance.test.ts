import { describe, it, expect } from "vitest";
import { enhanceCost, tryEnhance, withPlus, statsAt, ENH, plusOf, canEnhance, successChanceOf } from "../src/logic/enhance";
import { generateItem, equipmentStats } from "../src/logic/items";
import { seededRng } from "../src/logic/shop";
import { deserialize, serialize } from "../src/logic/save";

const sword = () => generateItem(seededRng(3), 5, { rarity: "rare", baseId: "emberBlade" });
const always = () => 0, never = () => 0.9999;

describe("강화", () => {
  it("성공하면 +1 되고 스탯이 증가, 원본 불변", () => {
    const it = sword();
    const r = tryEnhance(10000, it, always);
    expect(r.ok && r.success).toBe(true);
    if (r.ok) {
      expect(plusOf(r.item)).toBe(1);
      expect(plusOf(it)).toBe(0);
      for (const [k, v] of Object.entries(it.stats)) expect((r.item.stats as any)[k]).toBeGreaterThanOrEqual(v as number);
      expect(r.gold).toBe(10000 - enhanceCost(it));
    }
  });
  it("실패하면 단계 유지, 골드만 소모", () => {
    let it = withPlus(sword(), 5);
    const r = tryEnhance(10000, it, never);
    expect(r.ok && !r.success).toBe(true);
    if (r.ok) { expect(plusOf(r.item)).toBe(5); expect(r.gold).toBeLessThan(10000); }
  });
  it("골드 부족·최대 단계 거부", () => {
    const it = sword();
    expect(tryEnhance(enhanceCost(it) - 1, it, always)).toEqual({ ok: false, reason: "gold" });
    const max = withPlus(it, ENH.maxPlus);
    expect(canEnhance(max)).toBe(false);
    expect(tryEnhance(1e9, max, always)).toEqual({ ok: false, reason: "max" });
  });
  it("+10 스탯은 기본의 1+step×10배, 되돌리면 원본과 같다", () => {
    const it = sword();
    const m = withPlus(it, 10);
    expect(m.stats.atk ?? 0).toBeGreaterThan((it.stats.atk ?? 0) * 1.5);
    expect(withPlus(m, 0).stats).toEqual(it.stats);
    expect(statsAt(it.stats, 0)).toEqual(it.stats);
  });
  it("비용은 단계가 오를수록 증가, 성공률은 단조 비증가", () => {
    const it = sword();
    let prevC = 0, prevP = 1;
    for (let p = 0; p < ENH.maxPlus; p++) {
      const x = withPlus(it, p);
      expect(enhanceCost(x)).toBeGreaterThan(prevC); prevC = enhanceCost(x);
      expect(successChanceOf(x)).toBeLessThanOrEqual(prevP); prevP = successChanceOf(x);
    }
  });
  it("장착 중 강화 아이템은 장비 합계에 반영된다", () => {
    const it = sword();
    const m = withPlus(it, 4);
    const slot = it.kind === "weapon" ? "weapon" : it.kind === "ring" ? "ring1" : (it.kind as any);
    const a = equipmentStats({ [slot]: it }), b = equipmentStats({ [slot]: m });
    expect(b.atk + b.def + b.maxHp).toBeGreaterThanOrEqual(a.atk + a.def + a.maxHp);
  });
  it("확률 기댓값: +10까지 평균 시도 횟수와 골드가 유한하고 비용 비중이 합리적", () => {
    const it = sword();
    let tries = 0, gold = 0, cur = it;
    const rng = seededRng(42);
    while (canEnhance(cur) && tries < 5000) { const r = tryEnhance(1e9, cur, rng); if (!r.ok) break; gold += r.cost; cur = r.item; tries++; }
    expect(plusOf(cur)).toBe(ENH.maxPlus);
    expect(tries).toBeGreaterThan(10);
    expect(tries).toBeLessThan(200);
  });
});
