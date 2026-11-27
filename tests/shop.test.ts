import { describe, it, expect } from "vitest";
import { buyPrice, sellPrice, makeStock, tryBuy, trySell, seededRng, SHOP } from "../src/logic/shop";
import { generateItem, RARITIES } from "../src/logic/items";

const mk = (rarity: any, ilvl = 1, kind = "weapon") => ({ rarity, ilvl, kind }) as any;

describe("가격", () => {
  it("등급이 높을수록·레벨이 높을수록 비싸다", () => {
    let prev = 0;
    for (const r of RARITIES) { const p = buyPrice(mk(r.id)); expect(p).toBeGreaterThan(prev); prev = p; }
    expect(buyPrice(mk("rare", 10))).toBeGreaterThan(buyPrice(mk("rare", 1)));
  });
  it("판매가는 항상 매입가보다 낮고 1 이상, 5 단위 매입가", () => {
    for (const r of RARITIES) for (const kind of ["weapon", "head", "body", "hands", "feet", "ring"]) for (const lv of [1, 5, 20]) {
      const it = mk(r.id, lv, kind);
      expect(sellPrice(it)).toBeLessThan(buyPrice(it));
      expect(sellPrice(it)).toBeGreaterThanOrEqual(1);
      expect(buyPrice(it) % 5).toBe(0);
    }
  });
  it("모든 등급·종류에 가격표가 있다", () => {
    for (const r of RARITIES) expect((SHOP.basePrice as any)[r.id]).toBeGreaterThan(0);
  });
});

describe("강화 반영", () => {
  it("강화한 아이템은 더 비싸게 팔리지만 쓴 골드보다는 적게 받는다", async () => {
    const { withPlus, enhanceCost } = await import("../src/logic/enhance");
    const a = generateItem(seededRng(9), 6, { rarity: "rare" });
    const b = withPlus(a, 6);
    expect(sellPrice(b)).toBeGreaterThan(sellPrice(a));
    let spent = 0; for (let p = 0; p < 6; p++) spent += enhanceCost({ ...a, plus: p });
    expect(sellPrice(b) - sellPrice(a)).toBeLessThan(spent);
  });
});

describe("재고", () => {
  it("같은 레벨이면 같은 재고, 레벨이 오르면 상위 등급이 추가", () => {
    const a = makeStock(3), b = makeStock(3);
    expect(a.map((i) => [i.baseId, i.rarity, i.uid])).toEqual(b.map((i) => [i.baseId, i.rarity, i.uid]));
    expect(a.some((i) => i.rarity === "rare")).toBe(false);
    expect(makeStock(8).filter((i) => i.rarity === "rare").length).toBe(2);
  });
  it("재고 uid는 서로 겹치지 않는다", () => {
    const s = makeStock(10);
    expect(new Set(s.map((i) => i.uid)).size).toBe(s.length);
  });
  it("시드 난수는 결정적이고 0~1", () => {
    const r1 = seededRng(5), r2 = seededRng(5);
    for (let i = 0; i < 50; i++) { const x = r1(); expect(x).toBe(r2()); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});

describe("거래", () => {
  const item = makeStock(5)[2];
  it("골드가 부족하면 구매 불가, 가방이 가득 차도 불가", () => {
    expect(tryBuy(buyPrice(item) - 1, [], item, 30)).toEqual({ ok: false, reason: "gold" });
    const full = Array.from({ length: 30 }, () => item);
    expect(tryBuy(99999, full, item, 30)).toEqual({ ok: false, reason: "full" });
  });
  it("구매하면 골드가 정확히 줄고 가방에 들어간다(uid는 새로 부여)", () => {
    const g = buyPrice(item) + 7;
    const r = tryBuy(g, [], item, 30);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.gold).toBe(7);
      expect(r.inv).toHaveLength(1);
      expect(r.inv[0].baseId).toBe(item.baseId);
      expect(r.inv[0].uid).not.toBe(item.uid);
    }
  });
  it("판매하면 골드가 오르고 그 아이템만 빠진다", () => {
    const a = generateItem(seededRng(1), 3, { rarity: "rare" }), b = generateItem(seededRng(2), 3, { rarity: "common" });
    const r = trySell(100, [a, b], 0);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.gold).toBe(100 + sellPrice(a)); expect(r.inv).toEqual([b]); }
    expect(trySell(100, [a], 5)).toEqual({ ok: false });
  });
  it("사자마자 되팔면 손해다(차익 없음)", () => {
    const r = tryBuy(10000, [], item, 30);
    if (!r.ok) throw new Error("buy failed");
    const s = trySell(r.gold, r.inv, 0);
    if (!s.ok) throw new Error("sell failed");
    expect(s.gold).toBeLessThan(10000);
  });
});
