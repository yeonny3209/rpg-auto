import { describe, it, expect } from "vitest";
import { bagAdd, bagTake, usePotion, sanitizeBag, rollMatDrops, MATS } from "../src/logic/bag";
import { RECIPES, craft, shortfall } from "../src/logic/crafting";
import { seededRng } from "../src/logic/shop";
import { generateItem } from "../src/logic/items";

describe("가방", () => {
  it("최대치까지만 담고 실제 담긴 수를 돌려준다", () => {
    const r = bagAdd({ potion: 8 }, "potion", 5);
    expect(r.added).toBe(MATS.potion.max - 8);
    expect(r.bag.potion).toBe(MATS.potion.max);
    expect(bagAdd({ potion: MATS.potion.max }, "potion", 1).added).toBe(0);
  });
  it("차감은 모자라면 null, 0이 되면 항목 제거, 원본 불변", () => {
    const b = { ashLump: 3 };
    expect(bagTake(b, "ashLump", 4)).toBeNull();
    expect(bagTake(b, "ashLump", 3)).toEqual({});
    expect(b.ashLump).toBe(3);
  });
  it("저장 정리: 모르는 키·음수·소수·초과분 정리", () => {
    expect(sanitizeBag({ potion: 99, junk: 5, ashLump: -2, emberCore: 2.9 })).toEqual({ potion: MATS.potion.max, emberCore: 2 });
    expect(sanitizeBag(null)).toEqual({});
    expect(sanitizeBag([1, 2])).toEqual({});
  });
});

describe("물약", () => {
  it("체력을 40% 회복하되 최대치를 넘지 않고 1개 소모", () => {
    const r = usePotion(10, 100, { potion: 2 }, 0);
    expect(r).toMatchObject({ ok: true, hp: 50, healed: 40 });
    if (r.ok) expect(r.bag.potion).toBe(1);
    const r2 = usePotion(90, 100, { potion: 1 }, 0);
    expect(r2).toMatchObject({ ok: true, hp: 100, healed: 10 });
  });
  it("쿨타임·가득 찬 체력·재고 없음이면 소모하지 않는다", () => {
    expect(usePotion(10, 100, { potion: 1 }, 3)).toEqual({ ok: false, reason: "cooldown" });
    expect(usePotion(100, 100, { potion: 1 }, 0)).toEqual({ ok: false, reason: "full" });
    expect(usePotion(10, 100, {}, 0)).toEqual({ ok: false, reason: "none" });
  });
});

describe("드롭", () => {
  it("일반 적은 가끔 재료, 보스는 항상 재료+불씨핵", () => {
    const rng = seededRng(7);
    let lumps = 0;
    for (let i = 0; i < 1000; i++) for (const d of rollMatDrops(rng, { level: 2, ai: "melee" })) if (d.id === "ashLump") lumps += d.n;
    expect(lumps).toBeGreaterThan(200);
    expect(lumps).toBeLessThan(500);
    for (let i = 0; i < 20; i++) {
      const d = rollMatDrops(rng, { level: 5, ai: "boss" });
      expect(d.some((x) => x.id === "ashLump")).toBe(true);
      expect(d.some((x) => x.id === "emberCore")).toBe(true);
      expect(d.some((x) => x.id === "potion")).toBe(false);
    }
  });
  it("저레벨 일반 적은 불씨핵을 주지 않는다", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 500; i++) expect(rollMatDrops(rng, { level: 1, ai: "melee" }).some((x) => x.id === "emberCore")).toBe(false);
  });
});

describe("제작", () => {
  const rng = seededRng(11);
  const forge = RECIPES.find((r) => r.id === "forgeWeapon")!;
  it("재료·골드가 모자라면 무엇이 부족한지 알려준다", () => {
    expect(shortfall(forge, { ashLump: 3 }, 10).length).toBe(2);
    const r = craft(forge, { ashLump: 3 }, 10, [], 3, rng);
    expect(r.ok).toBe(false);
  });
  it("제작하면 재료·골드가 정확히 줄고 해당 종류·등급 장비가 생긴다", () => {
    const r = craft(forge, { ashLump: 10 }, 100, [], 4, rng);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bag.ashLump).toBe(2);
      expect(r.gold).toBe(40);
      expect(r.inv).toHaveLength(1);
      expect(r.inv[0].kind).toBe("weapon");
      expect(r.inv[0].rarity).toBe("uncommon");
      expect(r.inv[0].ilvl).toBe(4);
    }
  });
  it("장비 가방이 가득하면 재료를 쓰지 않는다", () => {
    const full = Array.from({ length: 30 }, () => generateItem(rng, 1));
    expect(craft(forge, { ashLump: 10 }, 100, full, 1, rng)).toEqual({ ok: false, reason: "full" });
  });
  it("물약 제작: 소모품 가방이 넘치면 거부(재료 보존)", () => {
    const pot = RECIPES.find((r) => r.id === "potion")!;
    const ok = craft(pot, { ashLump: 2 }, 0, [], 1, rng);
    expect(ok.ok && ok.bag.potion).toBe(3);
    expect(craft(pot, { ashLump: 2, potion: 9 }, 0, [], 1, rng)).toEqual({ ok: false, reason: "bagfull" });
  });
  it("모든 레시피의 재료·결과 종류가 실제로 존재한다", () => {
    for (const r of RECIPES) {
      for (const id of Object.keys(r.needs)) expect(id in MATS).toBe(true);
      for (const id of Object.keys(r.gives.bag ?? {})) expect(id in MATS).toBe(true);
      for (const k of r.gives.item?.kinds ?? []) expect(["weapon", "head", "body", "hands", "feet", "ring"]).toContain(k);
    }
  });
});

describe("저장 v5 → v6", () => {
  it("v5 저장은 빈 가방으로 이어진다", async () => {
    const { deserialize } = await import("../src/logic/save");
    const v5 = JSON.stringify({ version: 5, level: 3, exp: 1, statPoints: 0, attrs: { str: 1, agi: 0, wis: 0, vit: 0 }, gold: 5, inventory: [], equipment: {}, embers: { held: 0, banked: 0 }, litBeacons: [], respawnBeacon: "lastLight", trace: null, classId: null, quests: { active: {}, done: [] }, savedAt: 1 });
    expect(deserialize(v5)!.bag).toEqual({});
    expect(deserialize(v5)!.skillLv).toEqual({});
  });
});

describe("숲 전용 드롭 (matDrops)", () => {
  it("matDrops가 있는 적만 늪 수액을 남긴다", async () => {
    const { rollMatDrops } = await import("../src/logic/bag");
    const always = () => 0, never = () => 0.999;
    expect(rollMatDrops(always, { level: 7, ai: "melee", matDrops: { mireSap: 0.5 } }).some((d) => d.id === "mireSap")).toBe(true);
    expect(rollMatDrops(never, { level: 7, ai: "melee", matDrops: { mireSap: 0.5 } }).some((d) => d.id === "mireSap")).toBe(false);
    expect(rollMatDrops(always, { level: 7, ai: "melee" }).some((d) => d.id === "mireSap")).toBe(false);
  });
  it("알 수 없는 재료 id는 무시한다", async () => {
    const { rollMatDrops } = await import("../src/logic/bag");
    expect(rollMatDrops(() => 0, { level: 1, ai: "melee", matDrops: { nope: 1 } }).some((d) => (d.id as string) === "nope")).toBe(false);
  });
  it("숲 적 데이터가 숲 재료를 가리킨다", async () => {
    const enemies = (await import("../data/enemies.json")).default as Record<string, { matDrops?: Record<string, number> }>;
    const { isMatId } = await import("../src/logic/bag");
    for (const id of ["mireLeech", "sporeCaster", "bogBrute", "mireMother"]) {
      expect(Object.keys(enemies[id].matDrops ?? {}).length).toBeGreaterThan(0);
      for (const m of Object.keys(enemies[id].matDrops!)) expect(isMatId(m)).toBe(true);
    }
  });
});
