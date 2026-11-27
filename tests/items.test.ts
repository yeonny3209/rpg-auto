import { describe, it, expect } from "vitest";
import { generateItem, rollDrop, rollRarity, equipFromInventory, unequip, equipmentStats, slotsFor, RARITIES, type Item } from "../src/logic/items";
import { mulberry } from "./util";
import { serialize, deserialize } from "../src/logic/save";

describe("items", () => {
  it("등급별 부가옵션 개수와 스탯 배율", () => {
    const rng = mulberry(1);
    for (const r of RARITIES) {
      const it = generateItem(rng, 5, { rarity: r.id, baseId: "rustySword" });
      expect(it.affixes.length).toBe(r.affixes[0]);
      expect(it.stats.atk).toBeGreaterThan(0);
    }
    const c = generateItem(rng, 5, { rarity: "common", baseId: "rustySword" });
    const l = generateItem(rng, 5, { rarity: "legendary", baseId: "rustySword" });
    expect(l.stats.atk!).toBeGreaterThan(c.stats.atk!);
  });
  it("아이템 레벨이 높을수록 기본 스탯이 큼", () => {
    const rng = mulberry(2);
    const a = generateItem(rng, 1, { rarity: "common", baseId: "leatherCoat" });
    const b = generateItem(rng, 20, { rarity: "common", baseId: "leatherCoat" });
    expect(b.stats.def!).toBeGreaterThan(a.stats.def!);
  });
  it("부가옵션은 중복되지 않음", () => {
    const rng = mulberry(3);
    for (let i = 0; i < 50; i++) {
      const it = generateItem(rng, 10, { rarity: "legendary" });
      expect(new Set(it.affixes.map((a) => a.id)).size).toBe(it.affixes.length);
    }
  });
  it("희귀도 분포: 일반이 가장 흔하고 luck이 상위 등급을 늘림", () => {
    const count = (luck: number) => {
      const rng = mulberry(4), c: Record<string, number> = {};
      for (let i = 0; i < 5000; i++) { const r = rollRarity(rng, luck); c[r] = (c[r] ?? 0) + 1; }
      return c;
    };
    const base = count(0), lucky = count(1);
    expect(base.common).toBeGreaterThan(base.uncommon);
    expect(base.uncommon).toBeGreaterThan(base.rare);
    expect((lucky.epic ?? 0) + (lucky.legendary ?? 0)).toBeGreaterThan((base.epic ?? 0) + (base.legendary ?? 0));
  });
  it("드롭 확률", () => {
    expect(rollDrop(() => 0.99, 1, 0.3)).toBeNull();
    expect(rollDrop(mulberry(5), 1, 1)).not.toBeNull();
  });
  it("장착/교체/해제", () => {
    const rng = mulberry(6);
    const s1 = generateItem(rng, 1, { baseId: "rustySword", rarity: "common" });
    const s2 = generateItem(rng, 1, { baseId: "emberBlade", rarity: "rare" });
    let r = equipFromInventory({}, [s1, s2], 0)!;
    expect(r.eq.weapon).toBe(s1);
    expect(r.inv).toEqual([s2]);
    r = equipFromInventory(r.eq, r.inv, 0)!;
    expect(r.eq.weapon).toBe(s2);
    expect(r.inv).toEqual([s1]); // 기존 무기가 같은 칸으로
    const u = unequip(r.eq, r.inv, "weapon", 30)!;
    expect(u.eq.weapon).toBeUndefined();
    expect(u.inv.length).toBe(2);
    expect(unequip(r.eq, new Array(30).fill(s1), "weapon", 30)).toBeNull();
  });
  it("반지는 빈 칸부터 채움", () => {
    const rng = mulberry(7);
    const a = generateItem(rng, 1, { baseId: "cinderRing" }), b = generateItem(rng, 1, { baseId: "boneCharm" });
    expect(slotsFor("ring")).toEqual(["ring1", "ring2"]);
    let r = equipFromInventory({}, [a, b], 0)!;
    r = equipFromInventory(r.eq, r.inv, 0)!;
    expect(r.eq.ring1).toBe(a);
    expect(r.eq.ring2).toBe(b);
    expect(r.inv.length).toBe(0);
  });
  it("장비 스탯 합산", () => {
    const w = { stats: { atk: 5, crit: 0.02 } } as unknown as Item;
    const b = { stats: { def: 3, maxHp: 10, atk: 1 } } as unknown as Item;
    expect(equipmentStats({ weapon: w, body: b })).toEqual({ atk: 6, atkPct: 0, def: 3, maxHp: 10, crit: 0.02, maxStamina: 0 });
  });
  it("아이템은 저장/불러오기 왕복", () => {
    const rng = mulberry(8);
    const it = generateItem(rng, 3, { rarity: "epic" });
    const s = deserialize(serialize({ level: 2, exp: 0, statPoints: 0, attrs: { str: 0, agi: 0, wis: 0, vit: 0 }, gold: 0, inventory: [it], equipment: { weapon: it }, embers: { held: 0, banked: 0 }, litBeacons: [], respawnBeacon: "lastLight", trace: null, classId: null }))!;
    expect(s.inventory[0]).toEqual(it);
    expect(s.equipment.weapon).toEqual(it);
  });
});
